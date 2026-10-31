import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { PROVIDERS, type AiProviderId } from '@/lib/ai/providers';

/**
 * Lista de modelos consultada ao vivo no provedor com a chave do usuário.
 * Espera 700 ms depois da digitação, usa o catálogo embutido enquanto isso (e
 * se a consulta falhar) e guarda o resultado por 10 min. A chave de cache leva
 * só o tamanho e os 6 últimos caracteres da chave de API, nunca a chave inteira.
 */
export function useProviderModels(provider: AiProviderId, apiKey: string) {
  const [debouncedKey, setDebouncedKey] = useState(apiKey.trim());

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedKey(apiKey.trim()), 700);
    return () => clearTimeout(timer);
  }, [apiKey]);

  const query = useQuery({
    queryKey: ['ai-models', provider, debouncedKey.length, debouncedKey.slice(-6)],
    queryFn: () => PROVIDERS[provider].listModels(debouncedKey),
    enabled: debouncedKey.length >= 20,
    staleTime: 10 * 60_000,
    retry: false,
  });

  return {
    models: query.data && query.data.length > 0 ? query.data : [...PROVIDERS[provider].catalog],
    live: query.isSuccess && (query.data?.length ?? 0) > 0,
    isFetching: query.isFetching,
    failed: query.isError,
  };
}
