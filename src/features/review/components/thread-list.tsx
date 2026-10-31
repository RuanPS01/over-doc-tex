import { MessageSquarePlus } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import type { ThreadSummary } from '../model/review';
import { ThreadCard } from './thread-card';

interface ThreadListProps {
  projectId: string;
  reviewId: string;
  threads: ThreadSummary[];
  /** Painel do comentário novo (marcação pendente), acima da lista. */
  pendingPanel: ReactNode;
  selectedThreadId: string | null;
  canWrite: boolean;
  canOpenSource: boolean;
  onSelect: (threadId: string) => void;
  onOpenSource: (thread: ThreadSummary) => void;
  onReply: (thread: ThreadSummary, body: string) => Promise<unknown>;
  onStatusChange: (thread: ThreadSummary, status: 'open' | 'resolved') => Promise<unknown>;
}

/** Lateral (ou Sheet no celular) com o comentário novo e as threads do documento aberto. */
export function ThreadList({
  projectId,
  reviewId,
  threads,
  pendingPanel,
  selectedThreadId,
  canWrite,
  canOpenSource,
  onSelect,
  onOpenSource,
  onReply,
  onStatusChange,
}: ThreadListProps) {
  const cardRefs = useRef(new Map<string, HTMLLIElement>());
  const openCount = threads.filter((thread) => thread.status !== 'resolved').length;

  useEffect(() => {
    if (selectedThreadId) cardRefs.current.get(selectedThreadId)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedThreadId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
      {pendingPanel}
      <p className="text-xs text-muted-foreground">
        {threads.length === 0
          ? canWrite
            ? 'Nenhum comentário ainda. Selecione um trecho do PDF, ou use Ponto ou Desenhar no topo.'
            : 'Nenhum comentário ainda.'
          : `${threads.length} ${threads.length === 1 ? 'comentário' : 'comentários'}, ${openCount} em aberto`}
      </p>
      {threads.length === 0 && canWrite && !pendingPanel && <MessageSquarePlus className="mx-auto size-6 text-muted-foreground" aria-hidden />}
      <ol className="flex flex-col gap-2">
        {threads.map((thread, index) => (
          <ThreadCard
            key={thread.id}
            ref={(element) => {
              if (element) cardRefs.current.set(thread.id, element);
              else cardRefs.current.delete(thread.id);
            }}
            projectId={projectId}
            reviewId={reviewId}
            thread={thread}
            number={index + 1}
            isSelected={thread.id === selectedThreadId}
            canWrite={canWrite}
            onOpenSource={canOpenSource ? () => onOpenSource(thread) : undefined}
            onSelect={() => onSelect(thread.id)}
            onReply={(body) => onReply(thread, body)}
            onStatusChange={(status) => onStatusChange(thread, status)}
          />
        ))}
      </ol>
    </div>
  );
}
