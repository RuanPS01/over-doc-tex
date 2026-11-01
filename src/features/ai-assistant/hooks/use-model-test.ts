import { useCallback, useEffect, useRef, useState } from 'react';
import type { AiModelConfig } from '@/lib/ai/providers';
import { AiTaskError } from '@/lib/ai/schemas';
import { testModel, type ModelTestResult } from '@/lib/ai/test-model';

export type ModelTestState =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'ok'; result: ModelTestResult }
  | { status: 'error'; message: string };

/**
 * Botão "Testar" de um item da fila. O resultado vale para a combinação
 * provedor, modelo e chave do momento: mudar qualquer um apaga o resultado
 * (e cancela o teste em andamento).
 */
export function useModelTest(entry: AiModelConfig) {
  const [state, setState] = useState<ModelTestState>({ status: 'idle' });
  const controller = useRef<AbortController | null>(null);
  const signature = `${entry.provider}|${entry.model ?? ''}|${entry.apiKey.length}|${entry.apiKey.slice(-6)}`;

  useEffect(() => {
    controller.current?.abort();
    setState({ status: 'idle' });
  }, [signature]);

  useEffect(() => () => controller.current?.abort(), []);

  const run = useCallback(async () => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setState({ status: 'running' });
    try {
      const result = await testModel(entry, current.signal);
      if (!current.signal.aborted) setState({ status: 'ok', result });
    } catch (error) {
      if (current.signal.aborted) return;
      setState({ status: 'error', message: error instanceof AiTaskError ? error.message : 'O modelo não respondeu. Confira a chave, o nome do modelo e a conexão.' });
    }
  }, [entry]);

  return { state, run };
}
