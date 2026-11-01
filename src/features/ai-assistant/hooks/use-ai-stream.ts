import { useCallback, useEffect, useRef, useState } from 'react';
import { runAiTask } from '@/lib/ai/run-task';
import {
  AiTaskError,
  type AiConfig,
  type AiEvent,
  type AiSelection,
  type AiSourceFile,
  type AiStructuredResult,
  type AiTask,
} from '@/lib/ai/schemas';
import { t } from '@/lib/i18n';

export interface AiChatMessage {
  id: string;
  role: 'user' | 'assistant';
  task: AiTask;
  text: string;
  status: 'streaming' | 'complete' | 'error' | 'aborted';
  /** Etapa atual exibida enquanto a resposta não começa (ex.: "Abrindo 12 links"). */
  stage: string | null;
  sources: Extract<AiEvent, { type: 'context' }>['sources'];
  result: AiStructuredResult | null;
  error: string | null;
  /** Provedor e modelo que responderam (a lista pode ter trocado de modelo). */
  servedBy: string | null;
}

interface SendInput {
  task: AiTask;
  prompt: string;
  selection?: AiSelection | null;
}

/**
 * Conversa com a IA direto do navegador, com a configuração do usuário. Os
 * deltas são acumulados e aplicados uma vez por frame (requestAnimationFrame)
 * para não renderizar a cada token.
 */
export function useAiStream({ config, files }: { config: AiConfig | null; files: readonly AiSourceFile[] }) {
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const send = useCallback(
    async ({ task, prompt, selection = null }: SendInput) => {
      if (!config) return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const assistantId = crypto.randomUUID();
      const history = messages
        .filter((message) => message.status === 'complete' && message.text)
        .slice(-10)
        .map((message) => ({ role: message.role, content: message.text }));

      const base: Pick<AiChatMessage, 'task' | 'sources' | 'result' | 'error' | 'servedBy'> = {
        task,
        sources: [],
        result: null,
        error: null,
        servedBy: null,
      };
      setMessages((previous) => [
        ...previous,
        { ...base, id: crypto.randomUUID(), role: 'user', text: prompt, status: 'complete', stage: null },
        { ...base, id: assistantId, role: 'assistant', text: '', status: 'streaming', stage: t('Conectando') },
      ]);

      const update = (patch: (message: AiChatMessage) => Partial<AiChatMessage>) =>
        setMessages((previous) =>
          previous.map((message) => (message.id === assistantId ? { ...message, ...patch(message) } : message)),
        );

      let pending = '';
      let frame: number | null = null;
      const flush = () => {
        if (frame !== null) cancelAnimationFrame(frame);
        frame = null;
        const chunk = pending;
        pending = '';
        if (chunk) update((message) => ({ text: message.text + chunk, stage: null }));
      };

      try {
        const events = runAiTask({
          input: { task, prompt, selection, history },
          files,
          config,
          signal: controller.signal,
        });

        for await (const event of events) {
          switch (event.type) {
            case 'status':
              update(() => ({ stage: event.message }));
              break;
            case 'context':
              update(() => ({ sources: event.sources }));
              break;
            case 'delta':
              pending += event.text;
              frame ??= requestAnimationFrame(flush);
              break;
            case 'result':
              update(() => ({ result: event.result }));
              break;
            case 'switch':
              // O modelo anterior falhou: descarta o que ele escreveu e segue com o próximo.
              pending = '';
              update(() => ({ text: '', result: null, stage: event.message }));
              break;
            case 'done':
              flush();
              update(() => ({
                status: 'complete',
                stage: null,
                servedBy: `${event.servedBy.provider}, ${event.servedBy.model}`,
              }));
              return;
          }
        }
        flush();
        update(() => ({ status: 'complete', stage: null }));
      } catch (error) {
        flush();
        if (controller.signal.aborted) {
          update(() => ({ status: 'aborted', stage: null }));
          return;
        }
        const failure = error instanceof AiTaskError ? error : null;
        update((message) => ({
          status: 'error',
          stage: null,
          error: failure?.message ?? t('Falha ao falar com o assistente.'),
          text: failure?.discardPartial ? '' : message.text,
        }));
      }
    },
    [config, files, messages],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);
  const reset = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
  }, []);

  const isStreaming = messages.at(-1)?.status === 'streaming';
  return { messages, send, stop, reset, isStreaming };
}
