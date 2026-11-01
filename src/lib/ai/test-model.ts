/**
 * Teste rápido de um modelo: um pedido curto de verdade, com a chave do
 * item, para saber se o modelo responde (não só se existe). Sem novas
 * tentativas automáticas: o resultado é o que o provedor disse na hora.
 */
import { createProvider, resolveModel, type AiModelConfig } from './providers';

export interface ModelTestResult {
  model: string;
  /** Tempo até a resposta completa, em ms. */
  durationMs: number;
  /** Começo do que o modelo respondeu. */
  reply: string;
  /** O provedor respondeu por um modelo alternativo (recusa do principal). */
  usedFallback: boolean;
}

const TEST_SYSTEM = 'Você está sendo testado por um aplicativo. Responda exatamente com a palavra OK, sem mais nada.';

export async function testModel(entry: AiModelConfig, signal: AbortSignal): Promise<ModelTestResult> {
  const provider = await createProvider(entry, { maxRetries: 0 });
  const started = performance.now();
  let reply = '';
  let usedFallback = false;
  // Folga de tokens para modelos que raciocinam antes de responder.
  const input = { system: TEST_SYSTEM, messages: [{ role: 'user' as const, content: 'Teste de conexão. Responda OK.' }], effort: 'low' as const, maxTokens: 1024 };
  for await (const event of provider.streamText(input, signal)) {
    if (event.type === 'delta') reply += event.text;
    else if (event.type === 'fallback') usedFallback = true;
  }
  return {
    model: resolveModel(entry),
    durationMs: Math.round(performance.now() - started),
    reply: reply.replace(/\s+/g, ' ').trim().slice(0, 80),
    usedFallback,
  };
}
