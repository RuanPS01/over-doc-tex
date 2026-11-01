import { t } from '@/lib/i18n';
import { systemPrompt } from '../prompts';
import { PROVIDERS } from '../providers';
import { addUsage, type AiProvider, type FetchedPage } from '../providers/types';
import type { TextSource } from '../rag';
import {
  AiStructuredResultSchema,
  ReferenceAuditSchema,
  ReferenceJudgementSchema,
  type AiEvent,
  type AiTaskInput,
  type LinkStatus,
  type ReferenceAudit,
} from '../schemas';
import { TASKS } from '../tasks';
import { collectReferences } from './bibtex';

const MAX_REFERENCES = 60;

/**
 * checkReferences em três etapas: extração determinística das referências,
 * abertura dos links pela ferramenta web_fetch e julgamento semântico pela IA.
 * O status do link nunca vem do texto do modelo.
 */
export async function* runReferenceCheck(
  provider: AiProvider,
  input: AiTaskInput,
  sources: readonly TextSource[],
  signal: AbortSignal,
): AsyncGenerator<AiEvent> {
  const references = collectReferences(sources, MAX_REFERENCES);
  const urls = [...new Set(references.flatMap((ref) => (ref.url ? [ref.url] : [])))];

  yield { type: 'status', stage: 'checking_links', message: t('Abrindo {count} links', { count: urls.length }) };
  const fetched = urls.length > 0 ? await provider.fetchLinks(urls, signal) : null;
  const pageOf = (url: string | null): FetchedPage | null => (url ? (fetched?.pages.get(url) ?? null) : null);

  const payload = references.map((ref) => {
    const page = pageOf(ref.url);
    const link: LinkStatus = page ? page.status : 'no_url';
    return {
      key: ref.key,
      reference: { title: ref.title, authors: ref.authors, year: ref.year, url: ref.url },
      link,
      page: page ? { title: page.title, snippet: page.snippet } : null,
    };
  });

  yield { type: 'status', stage: 'generating', message: t('Comparando referências e conteúdo') };
  const { data, usage } = await provider.generateStructured(
    {
      system: systemPrompt('checkReferences'),
      messages: [
        {
          role: 'user',
          content: ['<pagina_externa>', JSON.stringify(payload, null, 2), '</pagina_externa>', `Pedido do usuário:\n${input.prompt}`].join('\n'),
        },
      ],
      effort: TASKS.checkReferences.effort,
      maxTokens: TASKS.checkReferences.maxTokens,
    },
    ReferenceJudgementSchema,
    signal,
  );

  yield { type: 'status', stage: 'validating', message: t('Validando o relatório') };
  const judgements = new Map(data.judgements.map((item) => [item.key, item]));
  const results: ReferenceAudit['results'] = payload.map((item) => {
    const judgement = judgements.get(item.key);
    const failed = item.link === 'broken' || item.link === 'blocked';
    return {
      key: item.key,
      url: item.reference.url,
      linkStatus: item.link,
      // Link que não abriu prevalece sobre qualquer opinião do modelo; sem link
      // ou sem verificação, o máximo possível é "incerto".
      verdict: failed
        ? 'unreachable'
        : item.link === 'ok'
          ? (judgement?.verdict ?? 'uncertain')
          : 'uncertain',
      explanation: judgement?.explanation ?? t('Sem avaliação para esta referência.'),
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

  yield { type: 'result', result: AiStructuredResultSchema.parse({ task: 'checkReferences', data: audit }) };
  yield {
    type: 'done',
    stopReason: 'end_turn',
    usage: fetched ? addUsage(fetched.usage, usage) : usage,
    servedBy: { provider: PROVIDERS[provider.id].label, model: provider.model },
  };
}
