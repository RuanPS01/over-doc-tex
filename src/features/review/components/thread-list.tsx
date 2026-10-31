import { MessageSquarePlus } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { ThreadSummary } from '../model/review';
import { CommentComposer } from './comment-composer';
import type { PendingPin } from './pin-layer';
import { ThreadCard } from './thread-card';

interface ThreadListProps {
  projectId: string;
  reviewId: string;
  threads: ThreadSummary[];
  pending: PendingPin | null;
  selectedThreadId: string | null;
  canWrite: boolean;
  onSelect: (threadId: string) => void;
  onCreate: (body: string) => Promise<unknown>;
  onCancelPending: () => void;
  onReply: (threadId: string, body: string) => Promise<unknown>;
  onStatusChange: (threadId: string, status: 'open' | 'resolved') => Promise<unknown>;
}

/** Lateral (ou Sheet no celular) com o comentário novo e as threads da revisão. */
export function ThreadList({
  projectId,
  reviewId,
  threads,
  pending,
  selectedThreadId,
  canWrite,
  onSelect,
  onCreate,
  onCancelPending,
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
      {pending && (
        <div className="flex flex-col gap-2 rounded-lg border border-annotation-3 bg-card p-3">
          <p className="text-xs font-medium">Novo comentário na página {pending.page}</p>
          <CommentComposer placeholder="Escreva o comentário" submitLabel="Comentar" autoFocus onSubmit={onCreate} onCancel={onCancelPending} />
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {threads.length === 0
          ? canWrite
            ? 'Nenhum comentário ainda. Use "Comentar" e clique no ponto do PDF que quer comentar.'
            : 'Nenhum comentário ainda.'
          : `${threads.length} ${threads.length === 1 ? 'comentário' : 'comentários'}, ${openCount} em aberto`}
      </p>
      {threads.length === 0 && canWrite && !pending && <MessageSquarePlus className="mx-auto size-6 text-muted-foreground" aria-hidden />}
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
            onSelect={() => onSelect(thread.id)}
            onReply={(body) => onReply(thread.id, body)}
            onStatusChange={(status) => onStatusChange(thread.id, status)}
          />
        ))}
      </ol>
    </div>
  );
}
