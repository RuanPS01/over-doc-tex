/**
 * Provedor Claude (SDK oficial da Anthropic), executado no navegador com a
 * chave do próprio usuário.
 *
 * - `dangerouslyAllowBrowser` é aceitável aqui porque a chave pertence a quem
 *   está usando o app e nunca é embutida no build nem enviada a outro servidor.
 * - Todas as chamadas usam stream, mesmo as estruturadas, para evitar timeouts.
 * - `fallbacks: 'default'` reexecuta no provedor uma requisição recusada pelos
 *   classificadores de segurança em um modelo alternativo.
 */
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { z } from 'zod';
import type { ProviderModel } from '../model-list';
import { FETCH_LINKS_PROMPT } from '../prompts';
import { AiTaskError } from '../schemas';
import {
  addUsage,
  normalizeUrl,
  pagesForRequestedUrls,
  parseJsonFromText,
  readableProviderMessage,
  type AiProvider,
  type ProviderOptions,
  type FetchedPage,
  type GenerationInput,
  type Usage,
} from './types';

const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
const MAX_PAUSE_RESUMES = 4;

function createClient(apiKey: string, maxRetries = 2): Anthropic {
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries });
}

function toUsage(message: Anthropic.Beta.BetaMessage): Usage {
  return { inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens };
}

function textOf(message: Anthropic.Beta.BetaMessage): string {
  return message.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('');
}

function assertCompleted(message: Anthropic.Beta.BetaMessage): void {
  if (message.stop_reason === 'refusal') {
    throw new AiTaskError('refused', 'O modelo recusou este pedido.', false, true);
  }
  if (message.stop_reason === 'max_tokens') {
    throw new AiTaskError('truncated', 'A resposta excedeu o limite de tamanho.', false);
  }
}

/** Converte erros do SDK em falhas com mensagem para o usuário (do mais específico ao mais genérico). */
function toAiTaskError(error: unknown): unknown {
  if (error instanceof AiTaskError || error instanceof Anthropic.APIUserAbortError) return error;
  if (error instanceof Anthropic.AuthenticationError) {
    return new AiTaskError('invalid_key', 'Chave da Anthropic inválida ou revogada. Confira a chave nas configurações do assistente.', false);
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return new AiTaskError('forbidden', 'A chave não tem permissão para este modelo ou recurso.', false);
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new AiTaskError('rate_limited', 'Limite de uso da chave atingido. Tente em instantes.', true);
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new AiTaskError('network', 'Sem conexão com a API da Anthropic.', true);
  }
  if (error instanceof Anthropic.APIError && (error.status ?? 0) >= 500) {
    return new AiTaskError('upstream', 'A API da Anthropic está indisponível no momento.', true);
  }
  if (error instanceof Anthropic.APIError) {
    return new AiTaskError('internal', `A API da Anthropic recusou o pedido: ${readableProviderMessage(error.message)}`, false);
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

/** Confere se a chave funciona e tem acesso ao modelo, sem gerar tokens. */
export const verifyAnthropicKey = guarded(async (apiKey: string, model: string) => {
  await createClient(apiKey).models.retrieve(model);
});

/** Modelos disponíveis para a chave (consultados ao vivo), com nome e data de lançamento. */
export const listAnthropicModels = guarded(async (apiKey: string): Promise<ProviderModel[]> => {
  const models: ProviderModel[] = [];
  for await (const model of createClient(apiKey).models.list()) {
    const released = Date.parse(model.created_at);
    models.push({ id: model.id, label: model.display_name || null, released: Number.isNaN(released) ? null : released });
  }
  return models;
});

function toFetchedPage(content: Anthropic.Beta.BetaWebFetchToolResultBlock['content']): FetchedPage {
  if (content.type === 'web_fetch_result') {
    const source = content.content.source;
    return {
      status: 'ok',
      title: content.content.title,
      snippet: source.type === 'text' ? source.data.replace(/\s+/g, ' ').trim().slice(0, 600) : null,
    };
  }
  switch (content.error_code) {
    case 'url_not_accessible':
      return { status: 'broken', title: null, snippet: null };
    case 'url_not_allowed':
      return { status: 'blocked', title: null, snippet: null };
    default:
      // Limite de uso, conteúdo não suportado, indisponibilidade: o link não foi verificado.
      return { status: 'unchecked', title: null, snippet: null };
  }
}

export function createAnthropicProvider(apiKey: string, model: string, options: ProviderOptions): AiProvider {
  const client = createClient(apiKey, options.maxRetries);
  const baseParams = (input: GenerationInput) => ({
    model,
    max_tokens: input.maxTokens,
    system: [{ type: 'text' as const, text: input.system, cache_control: { type: 'ephemeral' as const } }],
    messages: input.messages,
    thinking: { type: 'adaptive' as const },
    betas: [FALLBACK_BETA],
    fallbacks: 'default' as const,
  });

  return {
    id: 'anthropic',
    model,

    async *streamText(input, signal) {
      try {
        const stream = client.beta.messages.stream(
          { ...baseParams(input), output_config: { effort: input.effort } },
          { signal },
        );
        for await (const event of stream) {
          if (event.type === 'content_block_start' && event.content_block.type === 'fallback') {
            yield { type: 'fallback' };
          } else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            yield { type: 'delta', text: event.delta.text };
          }
        }
        const message = await stream.finalMessage();
        assertCompleted(message);
        yield { type: 'done', stopReason: message.stop_reason, usage: toUsage(message) };
      } catch (error) {
        throw toAiTaskError(error);
      }
    },

    /**
     * O formato é imposto duas vezes: pelo JSON Schema enviado ao provedor
     * (structured outputs) e por uma validação estrita com Zod aqui. Só o
     * schema vai ao provedor, sem o parser embutido do helper, para a falha
     * virar um erro tratável.
     */
    generateStructured: guarded(async <Schema extends z.ZodType>(input: GenerationInput, schema: Schema, signal: AbortSignal) => {
      const { schema: jsonSchema } = betaZodOutputFormat(schema);
      const stream = client.beta.messages.stream(
        {
          ...baseParams(input),
          output_config: { effort: input.effort, format: { type: 'json_schema', schema: jsonSchema } },
        },
        { signal },
      );
      const message = await stream.finalMessage();
      assertCompleted(message);
      let raw: unknown;
      try {
        raw = parseJsonFromText(textOf(message));
      } catch {
        throw new AiTaskError('invalid_output', 'A IA devolveu um JSON inválido.', true);
      }
      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        throw new AiTaskError('invalid_output', 'A IA devolveu dados fora do formato esperado.', true);
      }
      return { data: parsed.data as z.infer<Schema>, usage: toUsage(message) };
    }),

    /**
     * Abre os links com a ferramenta web_fetch, executada nos servidores da
     * Anthropic. O resultado de cada link vem dos blocos `web_fetch_tool_result`,
     * nunca do texto do modelo.
     */
    fetchLinks: guarded(async (urls: readonly string[], signal: AbortSignal) => {
      const found = new Map<string, FetchedPage>();
      const urlByToolUse = new Map<string, string>();
      let usage: Usage = { inputTokens: 0, outputTokens: 0 };
      const messages: Anthropic.Beta.BetaMessageParam[] = [
        { role: 'user', content: urls.map((url, index) => `${index + 1}. ${url}`).join('\n') },
      ];

      for (let round = 0; round <= MAX_PAUSE_RESUMES; round++) {
        const stream = client.beta.messages.stream(
          {
            model,
            max_tokens: 16_000,
            system: FETCH_LINKS_PROMPT,
            messages,
            tools: [
              {
                type: 'web_fetch_20260209',
                name: 'web_fetch',
                max_uses: urls.length,
                max_content_tokens: 2_000,
                // Chamadas diretas: o resultado de cada link chega como bloco próprio.
                allowed_callers: ['direct'],
              },
            ],
            thinking: { type: 'adaptive' },
            output_config: { effort: 'low' },
            betas: [FALLBACK_BETA],
            fallbacks: 'default',
          },
          { signal },
        );
        const message = await stream.finalMessage();
        usage = addUsage(usage, toUsage(message));

        for (const block of message.content) {
          if (block.type === 'server_tool_use' && block.name === 'web_fetch' && typeof block.input.url === 'string') {
            urlByToolUse.set(block.id, block.input.url);
          } else if (block.type === 'web_fetch_tool_result') {
            const url = urlByToolUse.get(block.tool_use_id);
            if (url) found.set(normalizeUrl(url), toFetchedPage(block.content));
          }
        }

        // pause_turn: reenviar a resposta do assistente faz o provedor continuar de onde parou.
        if (message.stop_reason !== 'pause_turn') break;
        messages.push({ role: 'assistant', content: message.content });
      }

      return { pages: pagesForRequestedUrls(urls, found), usage };
    }),
  };
}
