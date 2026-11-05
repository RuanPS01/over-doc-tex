import { MessageSquarePlus } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { useT } from '@/hooks/use-t';
import { canManageThread, type ReviewViewer, type ThreadSummary } from '../model/review';
import { ThreadCard } from './thread-card';

interface ThreadListProps {
  projectId: string;
  reviewId: string;
  previousReviewId: string | null;
  threads: ThreadSummary[];
  /** Painel do comentário novo (marcação pendente), acima da lista. */
  pendingPanel: ReactNode;
  selectedThreadId: string | null;
  canWrite: boolean;
  canOpenSource: boolean;
  viewer: ReviewViewer;
  /** Thread esperando a marcação nova no PDF ("Refazer a marcação"). */
  relocatingThreadId: string | null;
  onSelect: (threadId: string) => void;
  /** Clique no espaço vazio do painel: nenhuma thread fica selecionada. */
  onClearSelection: () => void;
  onOpenSource: (thread: ThreadSummary) => void;
  onReply: (thread: ThreadSummary, body: string) => Promise<unknown>;
  onStatusChange: (thread: ThreadSummary, status: 'open' | 'resolved') => Promise<unknown>;
  onEditComment: (thread: ThreadSummary, commentId: string, body: string) => Promise<unknown>;
  onDeleteComment: (thread: ThreadSummary, commentId: string) => Promise<unknown>;
  onRelocate: (thread: ThreadSummary) => void;
  onDelete: (thread: ThreadSummary) => Promise<unknown>;
}

/** Lateral (ou Sheet no celular) com o comentário novo e as threads do documento aberto. */
export function ThreadList({
  projectId,
  reviewId,
  previousReviewId,
  threads,
  pendingPanel,
  selectedThreadId,
  canWrite,
  canOpenSource,
  viewer,
  relocatingThreadId,
  onSelect,
  onClearSelection,
  onOpenSource,
  onReply,
  onStatusChange,
  onEditComment,
  onDeleteComment,
  onRelocate,
  onDelete,
}: ThreadListProps) {
  const { t } = useT();
  const cardRefs = useRef(new Map<string, HTMLLIElement>());
  const openCount = threads.filter((thread) => thread.status !== 'resolved').length;

  useEffect(() => {
    if (selectedThreadId) cardRefs.current.get(selectedThreadId)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedThreadId]);

  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3"
      onClick={(event) => {
        // Só o fundo: cartões, o comentário novo e os botões tratam o próprio clique.
        if (!(event.target as Element).closest('li, button, a, input, textarea, select, label, form')) onClearSelection();
      }}
    >
      {pendingPanel}
      <p className="text-xs text-muted-foreground">
        {threads.length === 0
          ? canWrite
            ? t('Nenhum comentário ainda. Selecione um trecho do PDF, ou use Ponto ou Desenhar no topo.')
            : t('Nenhum comentário ainda.')
          : threads.length === 1
            ? t('1 comentário, {open} em aberto', { open: openCount })
            : t('{count} comentários, {open} em aberto', { count: threads.length, open: openCount })}
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
            previousReviewId={previousReviewId}
            number={index + 1}
            isSelected={thread.id === selectedThreadId}
            canWrite={canWrite}
            viewer={viewer}
            canManage={canManageThread(thread, viewer)}
            isRelocating={thread.id === relocatingThreadId}
            onOpenSource={canOpenSource ? () => onOpenSource(thread) : undefined}
            onSelect={() => onSelect(thread.id)}
            onReply={(body) => onReply(thread, body)}
            onStatusChange={(status) => onStatusChange(thread, status)}
            onEditComment={(commentId, body) => onEditComment(thread, commentId, body)}
            onDeleteComment={(commentId) => onDeleteComment(thread, commentId)}
            onRelocate={() => onRelocate(thread)}
            onDelete={() => onDelete(thread)}
          />
        ))}
      </ol>
    </div>
  );
}
