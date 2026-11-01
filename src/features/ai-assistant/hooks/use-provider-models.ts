import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { fromIds, parseModelCatalog, prepareModelList, type ModelCatalog, type ProviderModel } from '@/lib/ai/model-list';
import { PROVIDERS, type AiProviderId } from '@/lib/ai/providers';
import { AiTaskError } from '@/lib/ai/schemas';

/** De onde veio a lista mostrada, da mais confiável para a menos. */
export type ModelListSource = 'live' | 'remembered' | 'catalog' | 'embedded';

const REMEMBERED_KEY = 'overdoctex.ai-models';

interface RememberedList {
  checkedAt: number;
  models: ProviderModel[];
}

/** Última lista que o provedor devolveu neste navegador (só nomes; a chave nunca é guardada aqui). */
function readRemembered(provider: AiProviderId): RememberedList | null {
  try {
    const all = JSON.parse(localStorage.getItem(REMEMBERED_KEY) ?? '{}') as Record<string, RememberedList | undefined>;
    const entry = all[provider];
    if (!entry || typeof entry.checkedAt !== 'number' || !Array.isArray(entry.models)) return null;
    const models = prepareModelList(provider, entry.models.filter((model) => model && typeof model.id === 'string'));
    return models.length > 0 ? { checkedAt: entry.checkedAt, models } : null;
  } catch {
    return null;
  }
}

function remember(provider: AiProviderId, models: ProviderModel[]): void {
  try {
    const all = JSON.parse(localStorage.getItem(REMEMBERED_KEY) ?? '{}') as Record<string, RememberedList>;
    all[provider] = { checkedAt: Date.now(), models };
    localStorage.setItem(REMEMBERED_KEY, JSON.stringify(all));
  } catch {
    // Armazenamento indisponível: a lista vale só nesta sessão.
  }
}

/** Catálogo público publicado com o site; ausente (dev local ou falha no deploy) vira nulo. */
async function loadCatalog(): Promise<ModelCatalog | null> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}ai-models.json`, { cache: 'no-cache' });
    return response.ok ? parseModelCatalog(await response.json()) : null;
  } catch {
    return null;
  }
}

export interface ProviderModelsState {
  models: ProviderModel[];
  source: ModelListSource;
  /** Quando a lista foi consultada (provedor) ou gerada (catálogo); nulo na lista embutida. */
  checkedAt: number | null;
  isFetching: boolean;
  /** Mensagem do provedor quando a consulta falhou. */
  error: string | null;
  /** Há chave para consultar o provedor. */
  canRefresh: boolean;
  refresh: () => void;
}

/**
 * Lista de modelos do campo "Modelo". Com a chave, vem do próprio provedor
 * (consulta ao vivo, 700 ms depois da digitação, guardada por 10 min). Sem a
 * chave, ou se a consulta falhar: a última lista que o provedor devolveu neste
 * navegador; senão o catálogo público publicado a cada deploy; senão a lista
 * embutida. A chave de cache leva só o tamanho e os 6 últimos caracteres da
 * chave de API, nunca a chave inteira.
 */
export function useProviderModels(provider: AiProviderId, apiKey: string): ProviderModelsState {
  const [debouncedKey, setDebouncedKey] = useState(apiKey.trim());

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedKey(apiKey.trim()), 700);
    return () => clearTimeout(timer);
  }, [apiKey]);

  const canRefresh = debouncedKey.length >= 20;
  const live = useQuery({
    queryKey: ['ai-models', provider, debouncedKey.length, debouncedKey.slice(-6)],
    queryFn: async () => {
      const models = prepareModelList(provider, await PROVIDERS[provider].listModels(debouncedKey));
      if (models.length > 0) remember(provider, models);
      return models;
    },
    enabled: canRefresh,
    staleTime: 10 * 60_000,
    retry: false,
  });
  const catalog = useQuery({ queryKey: ['ai-model-catalog'], queryFn: loadCatalog, staleTime: Number.POSITIVE_INFINITY, retry: false });

  const base = { isFetching: live.isFetching, canRefresh, refresh: () => void live.refetch() };
  const error = live.isError ? (live.error instanceof AiTaskError ? live.error.message : 'Não foi possível consultar o provedor.') : null;

  if (live.data && live.data.length > 0) {
    return { ...base, models: live.data, source: 'live', checkedAt: live.dataUpdatedAt, error: null };
  }
  const remembered = readRemembered(provider);
  if (remembered) return { ...base, models: remembered.models, source: 'remembered', checkedAt: remembered.checkedAt, error };
  const published = catalog.data?.providers[provider];
  if (catalog.data && published && published.length > 0) {
    return { ...base, models: published, source: 'catalog', checkedAt: catalog.data.generatedAt, error };
  }
  return { ...base, models: prepareModelList(provider, fromIds(PROVIDERS[provider].catalog)), source: 'embedded', checkedAt: null, error };
}
