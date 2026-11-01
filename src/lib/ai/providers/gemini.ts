/**
 * Provedor Gemini (SDK oficial @google/genai), executado no navegador com a
 * chave do próprio usuário.
 *
 * - Links das referências são abertos pela ferramenta `urlContext`; o status
 *   de cada URL vem de `urlContextMetadata`, nunca do texto do modelo.
 * - Saídas estruturadas usam `responseJsonSchema` e são revalidadas com Zod.
 */
import { ApiError, FinishReason, GoogleGenAI, UrlRetrievalStatus, type Content } from '@google/genai';
import { z } from 'zod';
import { t } from '@/lib/i18n';
import type { ProviderModel } from '../model-list';
import { AiTaskError } from '../schemas';
import {
  normalizeUrl,
  pagesForRequestedUrls,
  parseJsonFromText,
  readableProviderMessage,
  type AiProvider,
  type ProviderOptions,
  type ChatTurn,
  type FetchedPage,
  type GenerationInput,
  type Usage,
} from './types';

const REFUSAL_REASONS = new Set<FinishReason | undefined>([
  FinishReason.SAFETY,
  FinishReason.PROHIBITED_CONTENT,
  FinishReason.BLOCKLIST,
  FinishReason.SPII,
  FinishReason.RECITATION,
]);

function toContents(messages: readonly ChatTurn[]): Content[] {
  return messages.map((message) => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: message.content }],
  }));
}

function toUsage(metadata: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number } | undefined): Usage {
  return {
    inputTokens: metadata?.promptTokenCount ?? 0,
    outputTokens: (metadata?.candidatesTokenCount ?? 0) + (metadata?.thoughtsTokenCount ?? 0),
  };
}

function assertFinished(finishReason: FinishReason | undefined, blocked: boolean): void {
  if (blocked || REFUSAL_REASONS.has(finishReason)) {
    throw new AiTaskError('refused', t('O modelo recusou este pedido.'), false, true);
  }
  if (finishReason === FinishReason.MAX_TOKENS) {
    throw new AiTaskError('truncated', t('A resposta excedeu o limite de tamanho.'), false);
  }
}

function toAiTaskError(error: unknown): unknown {
  if (error instanceof AiTaskError) return error;
  if (error instanceof DOMException && error.name === 'AbortError') return error;
  if (error instanceof ApiError) {
    // A API do Gemini responde 400 para chave inválida.
    if (error.status === 401 || (error.status === 400 && /api key/i.test(error.message))) {
      return new AiTaskError('invalid_key', t('Chave do Gemini inválida ou revogada. Confira a chave nas configurações da IA.'), false);
    }
    if (error.status === 403) return new AiTaskError('forbidden', t('A chave não tem permissão para este modelo.'), false);
    if (error.status === 404) return new AiTaskError('forbidden', t('Modelo indisponível para esta chave.'), false);
    if (error.status === 429) {
      return new AiTaskError('rate_limited', t('Cota do Gemini esgotada ou limite por minuto atingido.'), true);
    }
    if (error.status >= 500) return new AiTaskError('upstream', t('A API do Gemini está indisponível no momento.'), true);
    return new AiTaskError('internal', t('A API do Gemini recusou o pedido: {message}', { message: readableProviderMessage(error.message) }), false);
  }
  if (error instanceof TypeError) return new AiTaskError('network', t('Sem conexão com a API do Gemini.'), true);
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

const FetchedPagesSchema = z.array(
  z.object({ url: z.string(), title: z.string().nullable(), summary: z.string().nullable() }),
);

export const verifyGeminiKey = guarded(async (apiKey: string, model: string) => {
  await new GoogleGenAI({ apiKey }).models.get({ model });
});

/** Modelos disponíveis para a chave (consultados ao vivo); o Gemini não informa data, só o nome. */
export const listGeminiModels = guarded(async (apiKey: string): Promise<ProviderModel[]> => {
  const pager = await new GoogleGenAI({ apiKey }).models.list({ config: { pageSize: 200 } });
  const models: ProviderModel[] = [];
  for await (const model of pager) {
    const id = model.name?.replace(/^models\//, '');
    // Só os que geram conteúdo; voz, imagem e agentes saem pelo filtro de model-list.ts.
    if (id && model.supportedActions?.includes('generateContent')) models.push({ id, label: model.displayName || null, released: null });
  }
  return models;
});

// O SDK do Gemini não repete pedidos sozinho; `_options` existe pela interface comum.
export function createGeminiProvider(apiKey: string, model: string, _options: ProviderOptions): AiProvider {
  const ai = new GoogleGenAI({ apiKey });

  return {
    id: 'gemini',
    model,

    async *streamText(input, signal) {
      try {
        const stream = await ai.models.generateContentStream({
          model,
          contents: toContents(input.messages),
          config: { systemInstruction: input.system, maxOutputTokens: input.maxTokens, abortSignal: signal },
        });
        let finishReason: FinishReason | undefined;
        let blocked = false;
        let usage: Usage = { inputTokens: 0, outputTokens: 0 };
        for await (const chunk of stream) {
          const text = chunk.text;
          if (text) yield { type: 'delta', text };
          finishReason = chunk.candidates?.[0]?.finishReason ?? finishReason;
          blocked ||= Boolean(chunk.promptFeedback?.blockReason);
          if (chunk.usageMetadata) usage = toUsage(chunk.usageMetadata);
        }
        assertFinished(finishReason, blocked);
        yield { type: 'done', stopReason: finishReason ?? null, usage };
      } catch (error) {
        throw toAiTaskError(error);
      }
    },

    generateStructured: guarded(async <Schema extends z.ZodType>(input: GenerationInput, schema: Schema, signal: AbortSignal) => {
      const { $schema: _ignored, ...jsonSchema } = z.toJSONSchema(schema) as Record<string, unknown>;
      const response = await ai.models.generateContent({
        model,
        contents: toContents(input.messages),
        config: {
          systemInstruction: input.system,
          maxOutputTokens: input.maxTokens,
          responseMimeType: 'application/json',
          responseJsonSchema: jsonSchema,
          abortSignal: signal,
        },
      });
      assertFinished(response.candidates?.[0]?.finishReason, Boolean(response.promptFeedback?.blockReason));
      let raw: unknown;
      try {
        raw = parseJsonFromText(response.text ?? '');
      } catch {
        throw new AiTaskError('invalid_output', t('A IA devolveu um JSON inválido.'), true);
      }
      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        throw new AiTaskError('invalid_output', t('A IA devolveu dados fora do formato esperado.'), true);
      }
      return { data: parsed.data as z.infer<Schema>, usage: toUsage(response.usageMetadata) };
    }),

    fetchLinks: guarded(async (urls: readonly string[], signal: AbortSignal) => {
      const response = await ai.models.generateContent({
        model,
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: [
                  'Abra cada URL abaixo com a ferramenta de contexto de URL.',
                  'Responda somente com um array JSON, um item por URL, no formato {"url": string, "title": string | null, "summary": string | null},',
                  'com o título da página e um resumo de uma frase. Não abra outras URLs.',
                  ...urls.map((url, index) => `${index + 1}. ${url}`),
                ].join('\n'),
              },
            ],
          },
        ],
        config: { tools: [{ urlContext: {} }], abortSignal: signal },
      });

      // Títulos e resumos são opcionais: servem só de insumo para o julgamento.
      let summaries: z.infer<typeof FetchedPagesSchema> = [];
      try {
        summaries = FetchedPagesSchema.parse(parseJsonFromText(response.text ?? ''));
      } catch {
        summaries = [];
      }
      const summaryOf = new Map(summaries.map((item) => [normalizeUrl(item.url), item]));

      const found = new Map<string, FetchedPage>();
      for (const meta of response.candidates?.[0]?.urlContextMetadata?.urlMetadata ?? []) {
        if (!meta.retrievedUrl) continue;
        const url = normalizeUrl(meta.retrievedUrl);
        const summary = summaryOf.get(url);
        const status: FetchedPage['status'] =
          meta.urlRetrievalStatus === UrlRetrievalStatus.URL_RETRIEVAL_STATUS_SUCCESS
            ? 'ok'
            : meta.urlRetrievalStatus === UrlRetrievalStatus.URL_RETRIEVAL_STATUS_ERROR
              ? 'broken'
              : meta.urlRetrievalStatus === UrlRetrievalStatus.URL_RETRIEVAL_STATUS_UNSAFE
                ? 'blocked'
                : 'unchecked';
        found.set(url, {
          status,
          title: status === 'ok' ? (summary?.title ?? null) : null,
          snippet: status === 'ok' ? (summary?.summary ?? null) : null,
        });
      }
      return { pages: pagesForRequestedUrls(urls, found), usage: toUsage(response.usageMetadata) };
    }),
  };
}
