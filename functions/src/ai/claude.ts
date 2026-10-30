/**
 * Integração com o provedor de IA (Claude, via SDK oficial da Anthropic).
 *
 * - Todas as chamadas usam stream, mesmo as estruturadas, para evitar
 *   timeouts HTTP em respostas longas.
 * - `fallbacks: 'default'` reexecuta no servidor uma requisição recusada
 *   pelos classificadores de segurança em um modelo alternativo.
 */
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { z } from 'zod';
import type { Effort } from './tasks';

export const AI_MODEL = 'claude-opus-5-5';
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

export type ChatTurn = Anthropic.Beta.BetaMessageParam;

export interface GenerationInput {
  system: string;
  messages: ChatTurn[];
  effort: Effort;
  maxTokens: number;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

/** Falhas de geração que viram eventos `error` específicos no stream. */
export class GenerationError extends Error {
  constructor(
    readonly code: 'refused' | 'truncated' | 'invalid_output',
    message: string,
    readonly usage: Usage,
  ) {
    super(message);
  }
}

export function createClient(apiKey: string): Anthropic {
  return new Anthropic({ apiKey });
}

function toUsage(message: Anthropic.Beta.BetaMessage): Usage {
  return { inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens };
}

function textOf(message: Anthropic.Beta.BetaMessage): string {
  return message.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('');
}

function assertCompleted(message: Anthropic.Beta.BetaMessage): void {
  if (message.stop_reason === 'refusal') {
    throw new GenerationError('refused', 'O modelo recusou este pedido.', toUsage(message));
  }
  if (message.stop_reason === 'max_tokens') {
    throw new GenerationError('truncated', 'A resposta excedeu o limite de tamanho.', toUsage(message));
  }
}

/** Gera texto livre, entregando cada delta assim que chega. */
export async function streamText(
  client: Anthropic,
  input: GenerationInput,
  handlers: { onDelta: (text: string) => void; onFallback: () => void },
  signal: AbortSignal,
): Promise<{ text: string; stopReason: string | null; usage: Usage }> {
  const stream = client.beta.messages.stream(
    {
      model: AI_MODEL,
      max_tokens: input.maxTokens,
      system: [{ type: 'text', text: input.system, cache_control: { type: 'ephemeral' } }],
      messages: input.messages,
      thinking: { type: 'adaptive' },
      output_config: { effort: input.effort },
      betas: [FALLBACK_BETA],
      fallbacks: 'default',
    },
    { signal },
  );

  for await (const event of stream) {
    if (event.type === 'content_block_start' && event.content_block.type === 'fallback') {
      handlers.onFallback();
    } else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      handlers.onDelta(event.delta.text);
    }
  }

  const message = await stream.finalMessage();
  assertCompleted(message);
  return { text: textOf(message), stopReason: message.stop_reason, usage: toUsage(message) };
}

/**
 * Gera JSON estruturado. O formato é imposto duas vezes: pelo schema enviado
 * ao provedor (structured outputs) e por uma validação estrita com Zod aqui,
 * antes de qualquer dado chegar ao cliente.
 */
export async function generateStructured<Schema extends z.ZodType>(
  client: Anthropic,
  input: GenerationInput,
  schema: Schema,
  signal: AbortSignal,
): Promise<{ data: z.infer<Schema>; usage: Usage }> {
  const stream = client.beta.messages.stream(
    {
      model: AI_MODEL,
      max_tokens: input.maxTokens,
      system: [{ type: 'text', text: input.system, cache_control: { type: 'ephemeral' } }],
      messages: input.messages,
      thinking: { type: 'adaptive' },
      output_config: { effort: input.effort, format: betaZodOutputFormat(schema) },
      betas: [FALLBACK_BETA],
      fallbacks: 'default',
    },
    { signal },
  );

  const message = await stream.finalMessage();
  assertCompleted(message);
  const usage = toUsage(message);

  let raw: unknown;
  try {
    raw = JSON.parse(textOf(message));
  } catch {
    throw new GenerationError('invalid_output', 'A IA devolveu um JSON inválido.', usage);
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new GenerationError('invalid_output', 'A IA devolveu dados fora do formato esperado.', usage);
  }
  return { data: parsed.data, usage };
}
