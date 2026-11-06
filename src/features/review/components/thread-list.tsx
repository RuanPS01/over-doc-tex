import { MessageSquarePlus } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { useT } from '@/hooks/use-t';
import { canManageThread, type ReviewTool, type ReviewViewer, type ThreadSummary } from '../model/review';
import { ThreadCard } from './thread-card';

interface ThreadListProps {
  projectId: string;
  reviewId: string;
  previousReviewId: string | null;
  threads: ThreadSummary[];
  /** Painel do comentário novo (marcação pendente), acima da lista. */
  pendingPanel: ReactNode;
  /** Muda quando a marcação pendente muda de tipo ou de página: o painel rola até ela. */
  pendingKey: string | null;
  selectedThreadId: string | null;
  canWrite: boolean;
  canOpenSource: boolean;
  viewer: ReviewViewer;
  /** Thread esperando a marcação nova no PDF ("Refazer a marcação"), a ferramenta e se há desenho em andamento. */
  relocation: { threadId: string; tool: ReviewTool; isDrawing: boolean } | null;
  onSelect: (threadId: string) => void;
  /** Clique no espaço vazio do painel: nenhuma thread fica selecionada. */
  onClearSelection: () => void;
  onOpenSource: (thread: ThreadSummary) => void;
  onReply: (thread: ThreadSummary, body: string) => Promise<unknown>;
  onStatusChange: (thread: ThreadSummary, status: 'open' | 'resolved') => Promise<unknown>;
  onEditComment: (thread: ThreadSummary, commentId: string, body: string, previous: string) => Promise<unknown>;
  onDeleteComment: (thread: ThreadSummary, commentId: string, body: string) => Promise<unknown>;
  onRelocate: (thread: ThreadSummary) => void;
  onCancelRelocate: () => void;
  onDelete: (thread: ThreadSummary) => Promise<unknown>;
}

/** Lateral (ou Sheet no celular) com o comentário novo e as threads do documento aberto. */
export function ThreadList({
  projectId,
  reviewId,
  previousReviewId,
  threads,
  pendingPanel,
  pendingKey,
  selectedThreadId,
  canWrite,
  canOpenSource,
  viewer,
  relocation,
  onSelect,
  onClearSelection,
  onOpenSource,
  onReply,
  onStatusChange,
  onEditComment,
  onDeleteComment,
  onRelocate,
  onCancelRelocate,
  onDelete,
}: ThreadListProps) {
  const { t } = useT();
  const cardRefs = useRef(new Map<string, HTMLLIElement>());
  const openCount = threads.filter((thread) => thread.status !== 'resolved').length;

  const pendingRef = useRef<HTMLDivElement>(null);
  const hasSelectedCard = threads.some((thread) => thread.id === selectedThreadId);
  const relocatingId = relocation?.threadId ?? null;

  // A thread escolhida (ou criada agora: o cartão pode aparecer um instante depois) fica à vista.
  useEffect(() => {
    if (selectedThreadId && hasSelectedCard) cardRefs.current.get(selectedThreadId)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedThreadId, hasSelectedCard]);

  // Marcação nova: o painel do comentário fica à vista. Sem isso o desenho, que não põe o cursor no
  // campo (para deixar desenhar mais traços), deixava o painel fora da tela.
  useEffect(() => {
    if (pendingKey) pendingRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [pendingKey]);

  // Remarcação: o cartão que espera a marcação nova (com o "Cancelar remarcação") fica à vista.
  useEffect(() => {
    if (relocatingId) cardRefs.current.get(relocatingId)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [relocatingId]);

  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3"
      onClick={(event) => {
        // Só o fundo: cartões, o comentário novo e os botões tratam o próprio clique.
        if (!(event.target as Element).closest('li, button, a, input, textarea, select, label, form')) onClearSelection();
      }}
    >
      {pendingPanel && <div ref={pendingRef}>{pendingPanel}</div>}
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
            relocation={relocation && relocation.threadId === thread.id ? { tool: relocation.tool, isDrawing: relocation.isDrawing } : null}
            onOpenSource={canOpenSource ? () => onOpenSource(thread) : undefined}
            onSelect={() => onSelect(thread.id)}
            onReply={(body) => onReply(thread, body)}
            onStatusChange={(status) => onStatusChange(thread, status)}
            onEditComment={(commentId, body, previous) => onEditComment(thread, commentId, body, previous)}
            onDeleteComment={(commentId, body) => onDeleteComment(thread, commentId, body)}
            onRelocate={() => onRelocate(thread)}
            onCancelRelocate={onCancelRelocate}
            onDelete={() => onDelete(thread)}
          />
        ))}
      </ol>
    </div>
  );
}
