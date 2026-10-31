import { AiTaskError, type AiConfig, type AiModelConfig } from '../schemas';
import { ANTHROPIC_MODEL, GEMINI_DEFAULT_MODEL, OPENAI_DEFAULT_MODEL } from './defaults';
import type { AiProvider, AiProviderId, ProviderOptions } from './types';

export type { AiProvider, AiProviderId } from './types';
export type { AiConfig, AiModelConfig } from '../schemas';

interface ProviderInfo {
  label: string;
  defaultModel: string;
  /** Lista embutida, usada enquanto a consulta ao provedor não volta ou quando ela falha. */
  catalog: readonly string[];
  keyUrl: string;
  /** Reconhece o formato da chave para sugerir o provedor ao colar. */
  matchesKey: (key: string) => boolean;
  /** Observação exibida no formulário. */
  note: string | null;
  verifyKey: (apiKey: string, model: string) => Promise<void>;
  listModels: (apiKey: string) => Promise<string[]>;
  create: (apiKey: string, model: string, options: ProviderOptions) => Promise<AiProvider>;
}

/**
 * Carrega o módulo de um provedor só quando ele é usado: os três SDKs somam
 * centenas de kB e cada usuário costuma usar um só. Falha ao baixar o pedaço
 * (sem rede, ou build novo publicado com a aba aberta) vira erro de rede, que
 * a fila trata como os demais.
 */
function lazy<T>(load: () => Promise<T>): () => Promise<T> {
  return () =>
    load().catch(() => {
      throw new AiTaskError('network', 'Não foi possível carregar o provedor de IA. Verifique a conexão e recarregue a página.', true);
    });
}

const loadAnthropic = lazy(() => import('./anthropic'));
const loadOpenAi = lazy(() => import('./openai'));
const loadGemini = lazy(() => import('./gemini'));

/** Registro único dos provedores: adicionar um provedor começa aqui. */
export const PROVIDERS: Record<AiProviderId, ProviderInfo> = {
  anthropic: {
    label: 'Claude (Anthropic)',
    defaultModel: ANTHROPIC_MODEL,
    catalog: [ANTHROPIC_MODEL, 'claude-sonnet-5-5', 'claude-haiku-5-5'],
    keyUrl: 'https://console.anthropic.com/settings/keys',
    matchesKey: (key) => key.startsWith('sk-ant-'),
    note: null,
    verifyKey: async (apiKey, model) => (await loadAnthropic()).verifyAnthropicKey(apiKey, model),
    listModels: async (apiKey) => (await loadAnthropic()).listAnthropicModels(apiKey),
    create: async (apiKey, model, options) => (await loadAnthropic()).createAnthropicProvider(apiKey, model, options),
  },
  openai: {
    label: 'OpenAI',
    defaultModel: OPENAI_DEFAULT_MODEL,
    catalog: [OPENAI_DEFAULT_MODEL, 'gpt-5-mini'],
    keyUrl: 'https://platform.openai.com/api-keys',
    matchesKey: (key) => key.startsWith('sk-') && !key.startsWith('sk-ant-'),
    note: 'A verificação de links das referências não está disponível com a OpenAI.',
    verifyKey: async (apiKey, model) => (await loadOpenAi()).verifyOpenAiKey(apiKey, model),
    listModels: async (apiKey) => (await loadOpenAi()).listOpenAiModels(apiKey),
    create: async (apiKey, model, options) => (await loadOpenAi()).createOpenAiProvider(apiKey, model, options),
  },
  gemini: {
    label: 'Gemini (Google)',
    defaultModel: GEMINI_DEFAULT_MODEL,
    catalog: [GEMINI_DEFAULT_MODEL, 'gemini-flash-latest', 'gemini-pro-latest', 'gemini-2.5-flash', 'gemini-2.5-pro'],
    keyUrl: 'https://aistudio.google.com/apikey',
    matchesKey: (key) => key.startsWith('AIza') || key.startsWith('AQ.'),
    note: 'No nível gratuito da API do Gemini, o Google pode usar o conteúdo enviado para melhorar os produtos dele. Evite textos confidenciais com chave gratuita.',
    verifyKey: async (apiKey, model) => (await loadGemini()).verifyGeminiKey(apiKey, model),
    listModels: async (apiKey) => (await loadGemini()).listGeminiModels(apiKey),
    create: async (apiKey, model, options) => (await loadGemini()).createGeminiProvider(apiKey, model, options),
  },
};

export const PROVIDER_IDS = Object.keys(PROVIDERS) as AiProviderId[];

export function resolveModel(entry: Pick<AiModelConfig, 'provider' | 'model'>): string {
  return entry.model ?? PROVIDERS[entry.provider].defaultModel;
}

export function createProvider(entry: AiModelConfig, options: ProviderOptions): Promise<AiProvider> {
  return PROVIDERS[entry.provider].create(entry.apiKey, resolveModel(entry), options);
}

export function detectProvider(key: string): AiProviderId | null {
  const trimmed = key.trim();
  return PROVIDER_IDS.find((id) => PROVIDERS[id].matchesKey(trimmed)) ?? null;
}

/** Índice do item anterior, do mesmo provedor, cuja chave uma reserva sem chave herda. */
export function inheritedKeySource(models: readonly AiModelConfig[], index: number): number | null {
  for (let previous = index - 1; previous >= 0; previous--) {
    const candidate = models[previous];
    if (candidate && candidate.provider === models[index]?.provider && candidate.apiKey.trim()) return previous;
  }
  return null;
}

/**
 * Fila pronta para uso: reservas sem chave herdam a do item anterior do mesmo
 * provedor (o usuário alterna entre modelos de um provedor digitando a chave
 * uma vez) e itens sem nenhuma credencial ficam de fora.
 */
export function resolveChain(config: AiConfig): AiModelConfig[] {
  return config.models.flatMap((entry, index) => {
    if (entry.apiKey.trim()) return [{ ...entry, apiKey: entry.apiKey.trim() }];
    const source = inheritedKeySource(config.models, index);
    const apiKey = source === null ? '' : (config.models[source]?.apiKey.trim() ?? '');
    return apiKey ? [{ ...entry, apiKey }] : [];
  });
}

export function isConfigUsable(config: AiConfig | null): boolean {
  return config !== null && resolveChain(config).length > 0;
}
