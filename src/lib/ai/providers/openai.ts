/**
 * Provedor OpenAI (SDK oficial, API Responses), executado no navegador com a
 * chave do próprio usuário.
 *
 * Limitação: a API não informa se cada link abriu, então `fetchLinks` devolve
 * os links como "não verificado" e o julgamento fica "incerto" para eles.
 */
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import type { z } from 'zod';
import { AiTaskError } from '../schemas';
import {
  pagesForRequestedUrls,
  parseJsonFromText,
  readableProviderMessage,
  type AiProvider,
  type GenerationInput,
  type ProviderOptions,
  type Usage,
} from './types';

const EFFORT: Record<GenerationInput['effort'], 'low' | 'medium' | 'high'> = { low: 'low', medium: 'medium', high: 'high' };

function createClient(apiKey: string, maxRetries = 2): OpenAI {
  return new OpenAI({ apiKey, dangerouslyAllowBrowser: true, maxRetries });
}

function toUsage(response: OpenAI.Responses.Response): Usage {
  return { inputTokens: response.usage?.input_tokens ?? 0, outputTokens: response.usage?.output_tokens ?? 0 };
}

function assertCompleted(response: OpenAI.Responses.Response): void {
  const refused = response.output.some(
    (item) => item.type === 'message' && item.content.some((part) => part.type === 'refusal'),
  );
  if (refused || response.incomplete_details?.reason === 'content_filter') {
    throw new AiTaskError('refused', 'O modelo recusou este pedido.', false, true);
  }
  if (response.incomplete_details?.reason === 'max_output_tokens') {
    throw new AiTaskError('truncated', 'A resposta excedeu o limite de tamanho.', false);
  }
}

function toAiTaskError(error: unknown): unknown {
  if (error instanceof AiTaskError || error instanceof OpenAI.APIUserAbortError) return error;
  if (error instanceof OpenAI.AuthenticationError) {
    return new AiTaskError('invalid_key', 'Chave da OpenAI inválida ou revogada. Confira a chave nas configurações da IA.', false);
  }
  if (error instanceof OpenAI.PermissionDeniedError || error instanceof OpenAI.NotFoundError) {
    return new AiTaskError('forbidden', 'A chave não tem acesso a este modelo.', false);
  }
  if (error instanceof OpenAI.RateLimitError) {
    return new AiTaskError('rate_limited', 'Limite de uso ou créditos da chave da OpenAI esgotados.', true);
  }
  if (error instanceof OpenAI.APIConnectionError) return new AiTaskError('network', 'Sem conexão com a API da OpenAI.', true);
  if (error instanceof OpenAI.APIError && (error.status ?? 0) >= 500) {
    return new AiTaskError('upstream', 'A API da OpenAI está indisponível no momento.', true);
  }
  if (error instanceof OpenAI.APIError) {
    return new AiTaskError('internal', `A API da OpenAI recusou o pedido: ${readableProviderMessage(error.message)}`, false);
  }
  return error;
}

function guarded<Args extends unknown[], Result>(fn: (...args: Args) => Promise<Result>) {
  return async (...args: Args): Promise<Result> => {
    try {
      return await fn(...args);
    } catch (error) {
      throw toAiTaskError(error);
    }
  };
}

export const verifyOpenAiKey = guarded(async (apiKey: string, model: string) => {
  await createClient(apiKey).models.retrieve(model);
});

export const listOpenAiModels = guarded(async (apiKey: string): Promise<string[]> => {
  const names: string[] = [];
  for await (const model of createClient(apiKey).models.list()) {
    if (/^(gpt-|o\d)/.test(model.id) && !/audio|realtime|transcribe|tts|image|search|embedding/i.test(model.id)) {
      names.push(model.id);
    }
  }
  return names.sort();
});

export function createOpenAiProvider(apiKey: string, model: string, options: ProviderOptions): AiProvider {
  const client = createClient(apiKey, options.maxRetries);
  const baseParams = (input: GenerationInput) => ({
    model,
    instructions: input.system,
    input: input.messages.map((message) => ({ role: message.role, content: message.content })),
    max_output_tokens: input.maxTokens,
    reasoning: { effort: EFFORT[input.effort] },
  });

  return {
    id: 'openai',
    model,

    async *streamText(input, signal) {
      try {
        const stream = client.responses.stream(baseParams(input), { signal });
        for await (const event of stream) {
          if (event.type === 'response.output_text.delta') yield { type: 'delta', text: event.delta };
        }
        const response = await stream.finalResponse();
        assertCompleted(response);
        yield { type: 'done', stopReason: response.status ?? null, usage: toUsage(response) };
      } catch (error) {
        throw toAiTaskError(error);
      }
    },

    generateStructured: guarded(async <Schema extends z.ZodType>(input: GenerationInput, schema: Schema, signal: AbortSignal) => {
      // Só o JSON Schema estrito vai à API; a validação fica com o Zod abaixo.
      const { schema: jsonSchema } = zodTextFormat(schema, 'resposta');
      const stream = client.responses.stream(
        { ...baseParams(input), text: { format: { type: 'json_schema', name: 'resposta', schema: jsonSchema, strict: true } } },
        { signal },
      );
      const response = await stream.finalResponse();
      assertCompleted(response);
      let raw: unknown;
      try {
        raw = parseJsonFromText(response.output_text);
      } catch {
        throw new AiTaskError('invalid_output', 'A IA devolveu um JSON inválido.', true);
      }
      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        throw new AiTaskError('invalid_output', 'A IA devolveu dados fora do formato esperado.', true);
      }
      return { data: parsed.data as z.infer<Schema>, usage: toUsage(response) };
    }),

    async fetchLinks(urls) {
      return { pages: pagesForRequestedUrls(urls, new Map()), usage: { inputTokens: 0, outputTokens: 0 } };
    },
  };
}
