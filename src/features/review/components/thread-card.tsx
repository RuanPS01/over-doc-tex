import { CheckCircle2, Code2, Crosshair, Loader2, MoreHorizontal, PenLine, RotateCcw, Trash2, X } from 'lucide-react';
import { forwardRef, useState, type MouseEvent } from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useT } from '@/hooks/use-t';
import { cn } from '@/lib/utils';
import { useComments } from '../hooks/use-threads';
import type { ReviewTool, ReviewViewer, ThreadSummary } from '../model/review';
import { CommentComposer } from './comment-composer';
import { ThreadComments } from './thread-comments';

/** Elementos que têm ação própria: o clique neles não muda a seleção da thread. */
const INTERACTIVE = 'button, a, input, textarea, select, label, form, [data-keep-selection], [role="menu"], [role="alertdialog"]';

/** Conversa da rodada anterior de uma thread levada adiante (só leitura). */
function CarriedComments({ projectId, previousReviewId, threadId }: { projectId: string; previousReviewId: string; threadId: string }) {
  const { data: comments = [] } = useComments(projectId, previousReviewId, threadId);
  const { t } = useT();
  if (comments.length === 0) return null;
  return (
    <div className="border-t bg-muted/40 px-3 py-2">
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t('Rodada anterior')}</p>
      <ol className="flex flex-col gap-3">
        <ThreadComments comments={comments} />
      </ol>
    </div>
  );
}

interface ThreadCardProps {
  projectId: string;
  reviewId: string;
  thread: ThreadSummary;
  /** Revisão de onde as threads levadas adiante vieram (para mostrar a conversa antiga). */
  previousReviewId: string | null;
  number: number;
  isSelected: boolean;
  canWrite: boolean;
  viewer: ReviewViewer;
  /** Quem criou a thread ou edita o projeto: refaz a marcação e exclui a thread. */
  canManage: boolean;
  /** Esta thread está esperando a marcação nova no PDF: a ferramenta em uso e se há um desenho em andamento. */
  relocation: { tool: ReviewTool; isDrawing: boolean } | null;
  /** Autor: abre o código na linha do comentário (SyncTeX da versão). */
  onOpenSource?: () => void;
  onSelect: () => void;
  onReply: (body: string) => Promise<unknown>;
  onStatusChange: (status: 'open' | 'resolved') => Promise<unknown>;
  onEditComment: (commentId: string, body: string, previous: string) => Promise<unknown>;
  onDeleteComment: (commentId: string, body: string) => Promise<unknown>;
  onRelocate: () => void;
  onCancelRelocate: () => void;
  onDelete: () => Promise<unknown>;
}

/** Uma thread: comentários, resposta, resolver ou reabrir e, para quem pode, refazer a marcação ou excluir. */
export const ThreadCard = forwardRef<HTMLLIElement, ThreadCardProps>(function ThreadCard(
  {
    projectId,
    reviewId,
    thread,
    previousReviewId,
    number,
    isSelected,
    canWrite,
    viewer,
    canManage,
    relocation,
    onOpenSource,
    onSelect,
    onReply,
    onStatusChange,
    onEditComment,
    onDeleteComment,
    onRelocate,
    onCancelRelocate,
    onDelete,
  },
  ref,
) {
  const { data: comments = [] } = useComments(projectId, reviewId, thread.id);
  const { t } = useT();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const isResolved = thread.status === 'resolved';
  const isOutdated = thread.status === 'outdated';
  const isPin = thread.anchor.type === 'pin';
  const isRelocating = relocation !== null;
  const relocationHint = !relocation
    ? ''
    : relocation.tool === 'select'
      ? t('Selecione no PDF o trecho novo deste comentário.')
      : relocation.tool === 'pin'
        ? t('Clique no PDF no lugar novo deste comentário.')
        : relocation.isDrawing
          ? t('Desenho em andamento: ele é salvo quando você parar de desenhar.')
          : t('Desenhe no PDF a marcação nova deste comentário.');

  // Clicar no cartão (fora de botões e campos) escolhe a thread ou, se ela já está escolhida, tira a seleção.
  // O teclado usa o botão do topo, que faz o mesmo.
  const handleCardClick = (event: MouseEvent<HTMLLIElement>) => {
    if ((event.target as Element).closest(INTERACTIVE)) return;
    // Soltar uma seleção de texto (para copiar um trecho do comentário) também gera clique.
    if (!(window.getSelection()?.isCollapsed ?? true)) return;
    onSelect();
  };

  const remove = async () => {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await onDelete();
    } catch (caught) {
      setDeleteError(caught instanceof Error && caught.message ? caught.message : t('Não foi possível excluir. Confira a conexão e tente de novo.'));
      setIsDeleting(false);
    }
  };

  return (
    <li
      ref={ref}
      onClick={handleCardClick}
      className={cn('cursor-pointer rounded-lg border bg-card text-sm', isSelected && 'ring-2 ring-ring', isRelocating && 'border-annotation-3')}
    >
      <div className="flex min-w-0 items-center pr-1 hover:bg-muted">
        <button
          type="button"
          aria-expanded={isSelected}
          title={isSelected ? t('Tirar a seleção') : undefined}
          onClick={onSelect}
          className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left"
        >
          <span
            className={cn(
              'flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
              isResolved ? 'border bg-muted text-foreground' : 'bg-annotation-3 text-background',
            )}
          >
            {number}
          </span>
          <span className="flex min-w-0 flex-1 items-center gap-1 truncate text-xs text-muted-foreground">
            {t('Página {page}', { page: thread.anchor.page })}
            {thread.anchor.type === 'pin' && thread.anchor.drawing && <PenLine className="size-3 shrink-0" aria-label={t('com desenho')} />}
          </span>
          {thread.carriedFromThreadId && <span className="shrink-0 rounded bg-muted px-1.5 text-[11px] text-muted-foreground">{t('rodada anterior')}</span>}
          {isResolved && (
            <span className="shrink-0 text-xs text-success">{thread.resolution?.fixedInSnapshotId ? t('Corrigida') : t('Resolvida')}</span>
          )}
          {isOutdated && <span className="shrink-0 text-xs text-warning">{t('Desatualizada')}</span>}
        </button>
        {canWrite && canManage && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8 shrink-0" aria-label={t('Ações do comentário {number}', { number })}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" collisionPadding={8} className="w-64 max-w-[calc(100vw-1rem)]">
              <DropdownMenuItem disabled={isRelocating} onSelect={onRelocate}>
                <Crosshair />
                {t('Refazer a marcação no PDF')}
              </DropdownMenuItem>
              {isPin && <p className="px-2 pb-1.5 text-xs text-muted-foreground">{t('Para só mudar de lugar, arraste o número no PDF.')}</p>}
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setConfirmDelete(true)}>
                <Trash2 />
                {t('Excluir comentário')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {confirmDelete && (
        <div role="alertdialog" aria-label={t('Excluir comentário')} className="mx-3 mb-2 flex flex-col gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs">
          <p>{t('Excluir este comentário, a marcação no PDF e as respostas? Dá para desfazer com Ctrl+Z ou o botão Desfazer.')}</p>
          {deleteError && <p className="text-destructive">{deleteError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" className="h-7" disabled={isDeleting} onClick={() => setConfirmDelete(false)}>
              {t('Cancelar')}
            </Button>
            <Button variant="destructive" size="sm" className="h-7" disabled={isDeleting} onClick={() => void remove()}>
              {isDeleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
              {t('Excluir')}
            </Button>
          </div>
        </div>
      )}
      {relocation && (
        // A marcação antiga já saiu do PDF; a nova vale assim que for feita. Cancelar traz a antiga de volta.
        <div data-keep-selection className="mx-3 mb-2 flex flex-col gap-2 rounded-md border border-annotation-3/60 bg-annotation-3/10 p-2 text-xs">
          <p role="status">{relocationHint}</p>
          <Button variant="outline" size="sm" className="h-7 self-start" onClick={onCancelRelocate}>
            <X />
            {t('Cancelar remarcação')}
          </Button>
        </div>
      )}
      {isOutdated && (
        <p className="mx-3 mb-2 text-xs text-muted-foreground">
          {t('O trecho comentado não foi encontrado na versão nova; a citação abaixo é da versão anterior.')}
        </p>
      )}
      {thread.anchor.type === 'text' && (
        <blockquote className="mx-3 mb-2 line-clamp-2 border-l-2 border-annotation-1 pl-2 text-xs italic text-muted-foreground">
          {thread.anchor.quote.exact}
        </blockquote>
      )}
      {thread.carriedFromThreadId && previousReviewId && (
        <CarriedComments projectId={projectId} previousReviewId={previousReviewId} threadId={thread.carriedFromThreadId} />
      )}
      {comments.length > 0 && (
        <ol className="flex flex-col gap-3 border-t px-3 py-2">
          <ThreadComments
            comments={comments}
            viewer={canWrite ? viewer : undefined}
            onEdit={canWrite ? onEditComment : undefined}
            onDelete={canWrite ? onDeleteComment : undefined}
          />
        </ol>
      )}
      {isSelected && canWrite && (
        <div data-keep-selection className="flex cursor-auto flex-col gap-2 border-t px-3 py-2">
          <CommentComposer placeholder={t('Responder')} submitLabel={t('Responder')} onSubmit={onReply} />
          <div className="flex flex-wrap gap-1">
            <Button variant="ghost" size="sm" onClick={() => void onStatusChange(isResolved ? 'open' : 'resolved')}>
              {isResolved ? <RotateCcw /> : <CheckCircle2 />}
              {isResolved ? t('Reabrir') : t('Marcar como resolvida')}
            </Button>
            {onOpenSource && thread.sourceHint && (
              <Button variant="ghost" size="sm" title={`${thread.sourceHint.path}:${thread.sourceHint.line}`} onClick={onOpenSource}>
                <Code2 />
                {t('Abrir no código')}
              </Button>
            )}
          </div>
        </div>
      )}
    </li>
  );
});
