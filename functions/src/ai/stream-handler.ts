import { randomUUID } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { AiRequestSchema, type AiRequest, type AiStreamEvent } from '@shared/ai/schemas';
import { HttpError, authenticate, requireProjectRole } from '../http/auth';
import { createNdjsonWriter } from '../http/ndjson';
import { GenerationError, createClient } from './claude';
import { ensureConversation, saveExchange } from './persistence';
import { runTask, type TaskOutcome } from './run-task';
import { TASKS } from './tasks';

type ErrorEvent = Extract<AiStreamEvent, { type: 'error' }>;

function toErrorEvent(error: unknown): ErrorEvent {
  if (error instanceof GenerationError) {
    return {
      type: 'error',
      code: error.code,
      message: error.message,
      retryable: error.code === 'invalid_output',
      discardPartial: error.code === 'refused',
    };
  }
  // Do mais específico para o mais genérico.
  if (error instanceof Anthropic.RateLimitError) {
    return { type: 'error', code: 'rate_limited', message: 'Muitas requisições. Tente em instantes.', retryable: true, discardPartial: false };
  }
  if (error instanceof Anthropic.APIError && (error.status ?? 0) >= 500) {
    return { type: 'error', code: 'upstream', message: 'O provedor de IA está indisponível.', retryable: true, discardPartial: false };
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return { type: 'error', code: 'upstream', message: 'Falha de conexão com o provedor de IA.', retryable: true, discardPartial: false };
  }
  return { type: 'error', code: 'internal', message: 'Erro inesperado ao gerar a resposta.', retryable: false, discardPartial: false };
}

/**
 * POST /aiStream
 *
 * Erros de autenticação e validação respondem com HTTP 4xx e JSON comum.
 * A partir do primeiro byte do stream, toda falha vira um evento `error`.
 */
export async function handleAiStream(req: Request, res: Response, deps: { apiKey: string }): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ code: 'invalid_request', message: 'Use POST.' });
    return;
  }

  let uid: string;
  let request: AiRequest;
  try {
    ({ uid } = await authenticate(req));
    const parsed = AiRequestSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'invalid_request', z.prettifyError(parsed.error));
    request = parsed.data;
    await requireProjectRole(request.projectId, uid, TASKS[request.task].roles);
  } catch (error) {
    if (error instanceof HttpError) {
      res.status(error.status).json({ code: error.code, message: error.message });
      return;
    }
    throw error;
  }

  const conversationId = await ensureConversation(request, uid);
  const writer = createNdjsonWriter(res);
  const abort = new AbortController();
  res.on('close', () => abort.abort());

  writer.send({ type: 'meta', requestId: randomUUID(), task: request.task, conversationId });

  let outcome: TaskOutcome | null = null;
  let status: 'complete' | 'error' | 'aborted' = 'complete';
  try {
    outcome = await runTask({ request, client: createClient(deps.apiKey), writer, signal: abort.signal });
    writer.send({ type: 'done', stopReason: outcome.stopReason, usage: outcome.usage });
  } catch (error) {
    if (abort.signal.aborted) {
      status = 'aborted';
    } else {
      status = 'error';
      console.error('aiStream falhou', { task: request.task, error });
      writer.send(toErrorEvent(error));
    }
  } finally {
    writer.end();
  }

  await saveExchange({ request, conversationId, outcome, status }).catch((error: unknown) =>
    console.error('Falha ao gravar a conversa', error),
  );
}
