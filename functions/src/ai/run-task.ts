import type Anthropic from '@anthropic-ai/sdk';
import {
  AiStructuredResultSchema,
  OutlineProposalSchema,
  ReferenceAuditSchema,
  ReferenceJudgementSchema,
  type AiRequest,
  type AiStructuredResult,
  type ReferenceAudit,
} from '@shared/ai/schemas';
import type { AiContextRef } from '@shared/firestore/types';
import type { NdjsonWriter } from '../http/ndjson';
import { checkLinks } from '../references/link-checker';
import { collectReferences } from '../references/bibtex';
import { generateStructured, streamText, type ChatTurn, type Usage } from './claude';
import { SYSTEM_PROMPTS, buildUserMessage } from './prompts';
import { buildOutline, chunkSource, rankChunks, selectSectionLeads, selectWithinBudget } from './rag';
import { loadSourceFiles } from './sources';
import { TASKS } from './tasks';

const MAX_REFERENCES = 60;

export interface TaskOutcome {
  text: string;
  structured: AiStructuredResult | null;
  contextRefs: AiContextRef[];
  stopReason: string | null;
  usage: Usage;
}

interface TaskContext {
  request: AiRequest;
  client: Anthropic;
  writer: NdjsonWriter;
  signal: AbortSignal;
}

function conversation(request: AiRequest, userMessage: string): ChatTurn[] {
  return [...request.history, { role: 'user', content: userMessage }];
}

/** Executa a tarefa pedida, emitindo eventos de progresso e de conteúdo. */
export async function runTask(ctx: TaskContext): Promise<TaskOutcome> {
  const { request, client, writer, signal } = ctx;
  const config = TASKS[request.task];

  writer.send({ type: 'status', stage: 'retrieving', message: 'Buscando trechos relevantes do projeto' });
  const files = await loadSourceFiles(request.projectId, request.scope.fileIds);

  if (request.task === 'checkReferences') return runReferenceCheck(ctx, files);

  const chunks = files.flatMap(chunkSource);
  const query = [request.prompt, request.selection?.text ?? ''].join('\n');
  const selected =
    config.context === 'section-leads'
      ? selectSectionLeads(chunks, config.contextBudgetChars)
      : selectWithinBudget(rankChunks(query, chunks), config.contextBudgetChars);
  const outline = config.context === 'section-leads' || request.task === 'generateDraft' ? buildOutline(files) : [];

  const contextRefs = selected.map(({ chunk }) => ({
    fileId: chunk.fileId,
    path: chunk.path,
    startLine: chunk.startLine,
    endLine: chunk.endLine,
  }));
  writer.send({
    type: 'context',
    sources: selected.map(({ chunk, score }) => ({
      path: chunk.path,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      score,
    })),
  });

  const input = {
    system: SYSTEM_PROMPTS[request.task],
    messages: conversation(request, buildUserMessage({ request, chunks: selected, outline })),
    effort: config.effort,
    maxTokens: config.maxTokens,
  };

  if (request.task === 'reorganizeTopics' || request.task === 'updateToc') {
    writer.send({ type: 'status', stage: 'generating', message: 'Analisando a estrutura do documento' });
    const { data, usage } = await generateStructured(client, input, OutlineProposalSchema, signal);
    writer.send({ type: 'status', stage: 'validating', message: 'Validando a proposta' });
    const structured = AiStructuredResultSchema.parse({ task: request.task, data });
    writer.send({ type: 'result', result: structured });
    return { text: data.summary, structured, contextRefs, stopReason: 'end_turn', usage };
  }

  writer.send({ type: 'status', stage: 'generating', message: 'Escrevendo' });
  const generated = await streamText(
    client,
    input,
    {
      onDelta: (text) => writer.send({ type: 'delta', text }),
      onFallback: () =>
        writer.send({ type: 'status', stage: 'fallback', message: 'Continuando com um modelo alternativo' }),
    },
    signal,
  );
  return { ...generated, structured: null, contextRefs };
}

/**
 * checkReferences em três etapas: extração determinística, verificação HTTP
 * no backend e julgamento semântico pela IA. O status do link nunca vem do
 * modelo; o modelo só decide se o conteúdo corresponde à referência.
 */
async function runReferenceCheck(
  ctx: TaskContext,
  files: Awaited<ReturnType<typeof loadSourceFiles>>,
): Promise<TaskOutcome> {
  const { request, client, writer, signal } = ctx;
  const references = collectReferences(files, MAX_REFERENCES);

  writer.send({
    type: 'status',
    stage: 'checking_links',
    message: `Testando ${references.filter((ref) => ref.url).length} links`,
  });
  const checks = await checkLinks(references.flatMap((ref) => (ref.url ? [ref.url] : [])));

  const payload = references.map((ref) => {
    const check = ref.url ? checks.get(ref.url) : undefined;
    return {
      key: ref.key,
      reference: { title: ref.title, authors: ref.authors, year: ref.year, url: ref.url },
      link: check
        ? { status: check.status, httpStatus: check.httpStatus, finalUrl: check.finalUrl }
        : { status: 'no_url', httpStatus: null, finalUrl: null },
      page: check ? { title: check.title, description: check.description, snippet: check.snippet } : null,
    };
  });

  writer.send({ type: 'status', stage: 'generating', message: 'Comparando referências e conteúdo' });
  const userMessage = [
    '<pagina_externa>',
    JSON.stringify(payload, null, 2),
    '</pagina_externa>',
    `Pedido do usuário:\n${request.prompt}`,
  ].join('\n');

  const { data, usage } = await generateStructured(
    client,
    {
      system: SYSTEM_PROMPTS.checkReferences,
      messages: [{ role: 'user', content: userMessage }],
      effort: TASKS.checkReferences.effort,
      maxTokens: TASKS.checkReferences.maxTokens,
    },
    ReferenceJudgementSchema,
    signal,
  );

  writer.send({ type: 'status', stage: 'validating', message: 'Validando o relatório' });
  const judgements = new Map(data.judgements.map((item) => [item.key, item]));
  const results: ReferenceAudit['results'] = payload.map((item) => {
    const judgement = judgements.get(item.key);
    const linkStatus = item.link.status as ReferenceAudit['results'][number]['linkStatus'];
    const reachable = linkStatus === 'ok' || linkStatus === 'redirected';
    return {
      key: item.key,
      url: item.reference.url,
      linkStatus,
      httpStatus: item.link.httpStatus,
      // Link quebrado prevalece sobre qualquer opinião do modelo.
      verdict: reachable ? (judgement?.verdict ?? 'uncertain') : 'unreachable',
      explanation: judgement?.explanation ?? 'Sem avaliação para esta referência.',
    };
  });
  const audit = ReferenceAuditSchema.parse({
    results,
    summary: {
      ok: results.filter((r) => r.verdict === 'matches').length,
      problems: results.filter((r) => r.verdict === 'mismatch' || r.verdict === 'unreachable').length,
      uncertain: results.filter((r) => r.verdict === 'uncertain').length,
    },
  });

  const structured = AiStructuredResultSchema.parse({ task: 'checkReferences', data: audit });
  writer.send({ type: 'result', result: structured });
  return {
    text: `${audit.summary.ok} referências conferem, ${audit.summary.problems} com problema, ${audit.summary.uncertain} incertas.`,
    structured,
    contextRefs: [],
    stopReason: 'end_turn',
    usage,
  };
}
