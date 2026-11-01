/**
 * Listas de modelos (puro): o que vem do provedor, do catálogo publicado no
 * deploy e do catálogo embutido passa pelas mesmas regras de filtro e ordem.
 */
import type { AiProviderId } from './providers/types';

/** Modelo listado: identificador da API, nome legível e data de lançamento. */
export interface ProviderModel {
  id: string;
  /** Nome de exibição ("Claude Opus 5.5"); nulo quando a fonte não informa. */
  label: string | null;
  /** Lançamento ou criação, em ms; nulo quando a fonte não informa. */
  released: number | null;
}

/** Fora da lista: voz, imagem, vídeo, transcrição, embeddings e agentes que não conversam por texto. */
const NOT_TEXT_CHAT: Record<AiProviderId, RegExp> = {
  anthropic: /^(?!claude-)/,
  openai: /^(?!(gpt-|o\d|chatgpt-))|audio|realtime|transcribe|tts|image|search|embedding|moderation|dall-e|whisper|sora|codex-mini/i,
  gemini: /^(?!gemini-|gemma-)|tts|image|banana|transcribe|robotics|computer-use|antigravity|deep-research|embedding|live|native-audio|veo|imagen|omni/i,
};

export function isTextChatModel(provider: AiProviderId, id: string): boolean {
  return !NOT_TEXT_CHAT[provider].test(id);
}

/** Primeira versão numérica do nome ("gemini-3.8-flash" dá [3, 8]; "claude-opus-5-5" dá [5, 5]). */
function versionOf(id: string): number[] {
  const match = /(\d+(?:[.-]\d+)*)/.exec(id.replace(/-(\d{8}|\d{4}-\d{2}-\d{2})$/, ''));
  return match ? match[1]!.split(/[.-]/).map(Number) : [];
}

function compareVersions(a: number[], b: number[]): number {
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const difference = (b[index] ?? -1) - (a[index] ?? -1);
    if (difference !== 0) return difference;
  }
  return 0;
}

/**
 * Mais novos primeiro: pela data quando as duas existem; senão, apelidos
 * "latest" (que sempre apontam para o mais novo), depois a versão no nome e,
 * por fim, o nome.
 */
export function compareModels(a: ProviderModel, b: ProviderModel): number {
  if (a.released !== null && b.released !== null && a.released !== b.released) return b.released - a.released;
  const latestA = /latest/.test(a.id);
  const latestB = /latest/.test(b.id);
  if (latestA !== latestB) return latestA ? -1 : 1;
  return compareVersions(versionOf(a.id), versionOf(b.id)) || a.id.localeCompare(b.id);
}

/** Filtra os que conversam por texto, tira repetidos e ordena. */
export function prepareModelList(provider: AiProviderId, models: readonly ProviderModel[]): ProviderModel[] {
  const byId = new Map<string, ProviderModel>();
  for (const model of models) {
    if (!model.id || !isTextChatModel(provider, model.id)) continue;
    const known = byId.get(model.id);
    byId.set(model.id, known ? { id: model.id, label: known.label ?? model.label, released: known.released ?? model.released } : model);
  }
  return [...byId.values()].sort(compareModels);
}

export const fromIds = (ids: readonly string[]): ProviderModel[] => ids.map((id) => ({ id, label: null, released: null }));

/** Catálogo publicado no deploy (public/ai-models.json, gerado por scripts/ai-models-catalog.mjs). */
export interface ModelCatalog {
  /** Quando o catálogo foi gerado, em ms. */
  generatedAt: number;
  providers: Partial<Record<AiProviderId, ProviderModel[]>>;
}

const PROVIDER_KEYS: readonly AiProviderId[] = ['anthropic', 'openai', 'gemini'];

/** Lê o JSON do catálogo; formato inesperado vira nulo (o app cai na lista embutida). */
export function parseModelCatalog(json: unknown): ModelCatalog | null {
  if (!json || typeof json !== 'object') return null;
  const { generatedAt, providers } = json as { generatedAt?: unknown; providers?: unknown };
  const when = typeof generatedAt === 'string' ? Date.parse(generatedAt) : Number.NaN;
  if (Number.isNaN(when) || !providers || typeof providers !== 'object') return null;
  const result: ModelCatalog = { generatedAt: when, providers: {} };
  for (const provider of PROVIDER_KEYS) {
    const list = (providers as Record<string, unknown>)[provider];
    if (!Array.isArray(list)) continue;
    const models = list.flatMap((item): ProviderModel[] => {
      if (!item || typeof item !== 'object') return [];
      const { id, label, released } = item as Record<string, unknown>;
      if (typeof id !== 'string' || !id) return [];
      return [{ id, label: typeof label === 'string' && label ? label : null, released: typeof released === 'number' ? released : null }];
    });
    if (models.length > 0) result.providers[provider] = prepareModelList(provider, models);
  }
  return result;
}
