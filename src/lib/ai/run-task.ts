import { orderByHealth, recordFailure, recordSuccess } from './model-chain';
import { SYSTEM_PROMPTS, buildUserMessage } from './prompts';
import { PROVIDERS, createProvider, resolveChain, resolveModel } from './providers';
import type { AiProvider } from './providers/types';
import { buildOutline, chunkSource, rankChunks, selectSectionLeads, selectWithinBudget, toTextSources } from './rag';
import { runReferenceCheck } from './references/check-references';
import {
  AiStructuredResultSchema,
  AiTaskError,
  OutlineProposalSchema,
  type AiConfig,
  type AiEvent,
  type AiModelConfig,
  type AiSourceFile,
  type AiTaskInput,
} from './schemas';
import { TASKS } from './tasks';

export interface RunAiTaskOptions {
  input: AiTaskInput;
  files: readonly AiSourceFile[];
  config: AiConfig;
  signal: AbortSignal;
}

/** Prazo de uma tentativa num modelo: nenhum SDK tem prazo útil por padrão. */
export const ATTEMPT_TIMEOUT_MS = 5 * 60_000;

const entryLabel = (entry: AiModelConfig) => `${PROVIDERS[entry.provider].label} (${resolveModel(entry)})`;

function toFailure(error: unknown, attemptSignal: AbortSignal): AiTaskError {
  if (attemptSignal.aborted) {
    // Estouro de prazo conta como indisponibilidade: o item pausa e a reserva assume.
    return new AiTaskError('upstream', 'O modelo demorou demais para responder.', true);
  }
  return error instanceof AiTaskError ? error : new AiTaskError('internal', 'Erro inesperado ao gerar a resposta.', false);
}

/**
 * Executa uma tarefa de IA no navegador com a fila de modelos do usuário.
 *
 * - Um modelo que falha cede a vez ao próximo; o evento `switch` faz a UI
 *   descartar o que ele já tinha escrito, para não emendar duas respostas.
 * - Quem falhou por limite, modelo ou chave pausa e vai para o fim da fila.
 * - JSON inválido é repetido uma vez no mesmo modelo antes de passar adiante.
 * - Todos falhando, o erro devolvido é o da primeira tentativa: é ele que diz
 *   o que aconteceu com o modelo que o usuário escolheu como principal.
 */
export async function* runAiTask(options: RunAiTaskOptions): AsyncGenerator<AiEvent> {
  const chain = orderByHealth(resolveChain(options.config));
  if (chain.length === 0) {
    throw new AiTaskError('not_configured', 'Configure a sua IA para usar o assistente.', false);
  }

  let firstFailure: AiTaskError | null = null;
  for (const [index, entry] of chain.entries()) {
    const next = chain[index + 1];
    let provider: AiProvider | null = null;

    for (let attempt = 0; attempt < 2; attempt++) {
      const attemptSignal = AbortSignal.timeout(ATTEMPT_TIMEOUT_MS);
      try {
        // Dentro do try: falha ao carregar o SDK passa a vez à reserva como qualquer outra.
        provider ??= await createProvider(entry, { maxRetries: next ? 0 : 2 });
        yield* execute({ ...options, signal: AbortSignal.any([options.signal, attemptSignal]) }, provider);
        recordSuccess(entry);
        return;
      } catch (error) {
        if (options.signal.aborted) throw error;
        const failure = toFailure(error, attemptSignal);
        if (failure.code === 'invalid_output' && attempt === 0) {
          yield { type: 'status', stage: 'validating', message: 'Formato inválido na resposta. Pedindo de novo.' };
          continue;
        }
        firstFailure ??= failure;
        recordFailure(entry, failure.code, failure.message, Boolean(next));
        // Resposta longa demais se repetiria em outro modelo: para aqui.
        if (failure.code === 'truncated') throw failure;
        if (!next) throw firstFailure;
        yield { type: 'switch', message: `${entryLabel(entry)}: ${failure.message} Tentando ${entryLabel(next)}.` };
        break;
      }
    }
  }
  throw firstFailure ?? new AiTaskError('internal', 'Nenhum modelo respondeu.', false);
}

async function* execute({ input, files, signal }: RunAiTaskOptions, provider: AiProvider): AsyncGenerator<AiEvent> {
  const config = TASKS[input.task];
  const servedBy = { provider: PROVIDERS[provider.id].label, model: provider.model };

  yield { type: 'status', stage: 'retrieving', message: 'Buscando trechos relevantes do projeto' };
  const sources = toTextSources(files);

  if (input.task === 'checkReferences') {
    yield* runReferenceCheck(provider, input, sources, signal);
    return;
  }

  const chunks = sources.flatMap(chunkSource);
  const query = [input.prompt, input.selection?.text ?? ''].join('\n');
  const selected =
    config.context === 'section-leads'
      ? selectSectionLeads(chunks, config.contextBudgetChars)
      : selectWithinBudget(rankChunks(query, chunks), config.contextBudgetChars);
  const outline = config.context === 'section-leads' || input.task === 'generateDraft' ? buildOutline(sources) : [];

  yield {
    type: 'context',
    sources: selected.map(({ chunk, score }) => ({
      path: chunk.path,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      score,
    })),
  };

  const generation = {
    system: SYSTEM_PROMPTS[input.task],
    messages: [
      ...input.history,
      { role: 'user' as const, content: buildUserMessage({ request: input, chunks: selected, outline }) },
    ],
    effort: config.effort,
    maxTokens: config.maxTokens,
  };

  if (input.task === 'reorganizeTopics' || input.task === 'updateToc') {
    yield { type: 'status', stage: 'generating', message: 'Analisando a estrutura do documento' };
    const { data, usage } = await provider.generateStructured(generation, OutlineProposalSchema, signal);
    yield { type: 'status', stage: 'validating', message: 'Validando a proposta' };
    yield { type: 'result', result: AiStructuredResultSchema.parse({ task: input.task, data }) };
    yield { type: 'done', stopReason: 'end_turn', usage, servedBy };
    return;
  }

  yield { type: 'status', stage: 'generating', message: 'Escrevendo' };
  for await (const event of provider.streamText(generation, signal)) {
    if (event.type === 'delta') yield event;
    else if (event.type === 'fallback') {
      yield { type: 'status', stage: 'fallback', message: 'Continuando com um modelo alternativo do provedor' };
    } else yield { type: 'done', stopReason: event.stopReason, usage: event.usage, servedBy };
  }
}
