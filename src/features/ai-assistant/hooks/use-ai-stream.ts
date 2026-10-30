import { useCallback, useEffect, useRef, useState } from 'react';
import type { AiRequest, AiSelection, AiStreamEvent, AiStructuredResult, AiTask } from '@shared/ai/schemas';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { streamAiTask } from '@/lib/ai/ai-client';
import { demoAiStream } from '@/lib/ai/demo-stream';
import { isFirebaseConfigured } from '@/lib/firebase/app';

export interface AiChatMessage {
  id: string;
  role: 'user' | 'assistant';
  task: AiTask;
  text: string;
  status: 'streaming' | 'complete' | 'error' | 'aborted';
  /** Etapa atual exibida enquanto a resposta não começa (ex.: "Testando 12 links"). */
  stage: string | null;
  sources: Extract<AiStreamEvent, { type: 'context' }>['sources'];
  result: AiStructuredResult | null;
  error: string | null;
}

interface SendInput {
  task: AiTask;
  prompt: string;
  selection?: AiSelection | null;
}

/**
 * Conversa com a IA consumindo o stream NDJSON. Os deltas são acumulados e
 * aplicados uma vez por frame (requestAnimationFrame) para não renderizar a
 * cada token.
 */
export function useAiStream(projectId: string) {
  const { getIdToken } = useAuth();
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const send = useCallback(
    async ({ task, prompt, selection = null }: SendInput) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const assistantId = crypto.randomUUID();
      const history = messages
        .filter((message) => message.status === 'complete' && message.text)
        .slice(-10)
        .map((message) => ({ role: message.role, content: message.text }));

      const base: Pick<AiChatMessage, 'task' | 'sources' | 'result' | 'error'> = {
        task,
        sources: [],
        result: null,
        error: null,
      };
      setMessages((previous) => [
        ...previous,
        { ...base, id: crypto.randomUUID(), role: 'user', text: prompt, status: 'complete', stage: null },
        { ...base, id: assistantId, role: 'assistant', text: '', status: 'streaming', stage: 'Conectando' },
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

      const request: AiRequest = {
        projectId,
        conversationId,
        task,
        prompt,
        selection,
        scope: { fileIds: [], allowExternalSources: task === 'checkReferences' },
        history,
      };

      try {
        const events = isFirebaseConfigured
          ? streamAiTask(request, { token: await getIdToken(), signal: controller.signal })
          : demoAiStream(request, controller.signal);

        for await (const event of events) {
          switch (event.type) {
            case 'meta':
              setConversationId(event.conversationId);
              break;
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
            case 'error':
              flush();
              update((message) => ({
                status: 'error',
                stage: null,
                error: event.message,
                text: event.discardPartial ? '' : message.text,
              }));
              return;
            case 'done':
              flush();
              update(() => ({ status: 'complete', stage: null }));
              return;
          }
        }
        flush();
        update(() => ({ status: 'complete', stage: null }));
      } catch (error) {
        flush();
        if (controller.signal.aborted) {
          update(() => ({ status: 'aborted', stage: null }));
        } else {
          const message = error instanceof Error ? error.message : 'Falha ao falar com o assistente.';
          update(() => ({ status: 'error', stage: null, error: message }));
        }
      }
    },
    [conversationId, getIdToken, messages, projectId],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);
  const reset = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setConversationId(null);
  }, []);

  const isStreaming = messages.at(-1)?.status === 'streaming';
  return { messages, send, stop, reset, isStreaming };
}
