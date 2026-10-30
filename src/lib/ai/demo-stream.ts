import type { AiRequest, AiStreamEvent } from '@shared/ai/schemas';

const DEMO_ANSWER = `Modo demonstração: o Firebase ainda não foi configurado, então esta resposta é simulada.

Com o backend ativo, o pedido **"{prompt}"** passaria por:

1. Recuperação lexical (BM25) dos trechos relevantes do projeto.
2. Prompt de sistema especializado para a tarefa \`{task}\`.
3. Stream NDJSON com um evento \`delta\` por fragmento de texto.

\`\`\`latex
\\section{Conclusão}
Este trabalho apresentou ... % TODO: completar com os resultados do Capítulo 4
\`\`\``;

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Abortado', 'AbortError'));
    });
  });
}

/** Simula o stream do backend para desenvolver a interface sem Firebase. */
export async function* demoAiStream(request: AiRequest, signal: AbortSignal): AsyncGenerator<AiStreamEvent> {
  yield { type: 'meta', requestId: crypto.randomUUID(), task: request.task, conversationId: null };
  yield { type: 'status', stage: 'retrieving', message: 'Buscando trechos relevantes do projeto' };
  await wait(400, signal);
  yield { type: 'context', sources: [{ path: 'main.tex', startLine: 1, endLine: 24, score: 3.2 }] };

  const text = DEMO_ANSWER.replace('{prompt}', () => request.prompt).replace('{task}', () => request.task);
  for (const piece of text.match(/.{1,12}/gs) ?? []) {
    await wait(25, signal);
    yield { type: 'delta', text: piece };
  }
  yield { type: 'done', stopReason: 'end_turn', usage: { inputTokens: 0, outputTokens: 0 } };
}
