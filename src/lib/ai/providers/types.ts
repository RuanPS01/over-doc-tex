import type { z } from 'zod';
import type { LinkStatus } from '../schemas';
import type { Effort } from '../tasks';

export type AiProviderId = 'anthropic' | 'openai' | 'gemini';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

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

export interface FetchedPage {
  status: Exclude<LinkStatus, 'no_url'>;
  title: string | null;
  snippet: string | null;
}

export type ProviderTextEvent =
  | { type: 'delta'; text: string }
  | { type: 'fallback' }
  | { type: 'done'; stopReason: string | null; usage: Usage };

/**
 * O que o motor precisa de um provedor de IA. Cada implementação converte os
 * próprios erros em `AiTaskError` com mensagem para o usuário.
 */
export interface AiProvider {
  readonly id: AiProviderId;
  readonly model: string;
  /** Texto livre em stream; o último evento é sempre `done`. */
  streamText(input: GenerationInput, signal: AbortSignal): AsyncGenerator<ProviderTextEvent>;
  /** JSON validado estritamente com o schema Zod antes de voltar. */
  generateStructured<Schema extends z.ZodType>(
    input: GenerationInput,
    schema: Schema,
    signal: AbortSignal,
  ): Promise<{ data: z.infer<Schema>; usage: Usage }>;
  /** Abre links com a ferramenta de busca do provedor (o navegador não consegue, por CORS). */
  fetchLinks(urls: readonly string[], signal: AbortSignal): Promise<{ pages: Map<string, FetchedPage>; usage: Usage }>;
}

export interface ProviderOptions {
  /**
   * Repetições automáticas do SDK em erro temporário. Com outro modelo na fila,
   * vale 0: são segundos parados num modelo que já disse não, com a reserva pronta.
   */
  maxRetries: number;
}

/**
 * Lê o JSON da resposta: dentro de uma cerca de código ou solto no texto, do
 * primeiro "{" (ou "[") ao último "}" (ou "]"). Funciona igual em todo provedor.
 */
export function parseJsonFromText(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)?.[1] ?? text;
  const start = fenced.search(/[[{]/);
  if (start === -1) throw new SyntaxError('Sem JSON na resposta.');
  const closer = fenced[start] === '[' ? ']' : '}';
  return JSON.parse(fenced.slice(start, fenced.lastIndexOf(closer) + 1));
}

/** A frase do provedor, sem o JSON aninhado que alguns SDKs colocam na mensagem. */
export function readableProviderMessage(message: string): string {
  const inner = /"message"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(message)?.[1];
  return (inner ? inner.replace(/\\"/g, '"') : message).slice(0, 300);
}

export function addUsage(a: Usage, b: Usage): Usage {
  return { inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens };
}

export const normalizeUrl = (url: string) => url.trim().replace(/\/+$/, '');

/** Garante uma entrada por URL pedida; o que o provedor não abriu fica como "não verificado". */
export function pagesForRequestedUrls(
  urls: readonly string[],
  found: ReadonlyMap<string, FetchedPage>,
): Map<string, FetchedPage> {
  return new Map(
    urls.map((url) => [url, found.get(normalizeUrl(url)) ?? { status: 'unchecked', title: null, snippet: null }]),
  );
}
