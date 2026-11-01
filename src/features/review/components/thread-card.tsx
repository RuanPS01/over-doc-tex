import { CheckCircle2, Code2, PenLine, RotateCcw } from 'lucide-react';
import { forwardRef, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { MarkdownContent } from '@/components/common/markdown-content';
import { useT } from '@/hooks/use-t';
import { cn } from '@/lib/utils';
import { useComments } from '../hooks/use-threads';
import type { CommentSummary, ThreadSummary } from '../model/review';
import { CommentComposer } from './comment-composer';

function CommentItems({ comments }: { comments: readonly CommentSummary[] }) {
  const { t, locale } = useT();
  const timeFormat = useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }), [locale]);
  return (
    <>
      {comments.map((comment) => (
        <li key={comment.id} className="flex flex-col gap-0.5">
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{comment.authorName}</span>
            {comment.authorRole === 'reviewer' ? ` ${t('(revisor)')}` : ''}
            {comment.createdAt ? ` · ${timeFormat.format(comment.createdAt)}` : ''}
          </p>
          <MarkdownContent markdown={comment.body} className="[&_p]:my-0.5" />
        </li>
      ))}
    </>
  );
}

/** Conversa da rodada anterior de uma thread levada adiante (só leitura). */
function CarriedComments({ projectId, previousReviewId, threadId }: { projectId: string; previousReviewId: string; threadId: string }) {
  const { data: comments = [] } = useComments(projectId, previousReviewId, threadId);
  const { t } = useT();
  if (comments.length === 0) return null;
  return (
    <div className="border-t bg-muted/40 px-3 py-2">
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t('Rodada anterior')}</p>
      <ol className="flex flex-col gap-3">
        <CommentItems comments={comments} />
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
  /** Autor: abre o código na linha do comentário (SyncTeX da versão). */
  onOpenSource?: () => void;
  onSelect: () => void;
  onReply: (body: string) => Promise<unknown>;
  onStatusChange: (status: 'open' | 'resolved') => Promise<unknown>;
}

/** Uma thread: comentários, resposta e resolver ou reabrir. */
export const ThreadCard = forwardRef<HTMLLIElement, ThreadCardProps>(function ThreadCard(
  { projectId, reviewId, thread, previousReviewId, number, isSelected, canWrite, onOpenSource, onSelect, onReply, onStatusChange },
  ref,
) {
  const { data: comments = [] } = useComments(projectId, reviewId, thread.id);
  const { t } = useT();
  const isResolved = thread.status === 'resolved';
  const isOutdated = thread.status === 'outdated';

  return (
    <li ref={ref} className={cn('rounded-lg border bg-card text-sm', isSelected && 'ring-2 ring-ring')}>
      <button type="button" onClick={onSelect} className="flex w-full min-w-0 items-center gap-2 px-3 py-2 text-left hover:bg-muted">
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
          <span className="shrink-0 text-xs text-success">
            {thread.resolution?.fixedInSnapshotId ? t('Corrigida') : t('Resolvida')}
          </span>
        )}
        {isOutdated && <span className="shrink-0 text-xs text-warning">{t('Desatualizada')}</span>}
      </button>
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
          <CommentItems comments={comments} />
        </ol>
      )}
      {isSelected && canWrite && (
        <div className="flex flex-col gap-2 border-t px-3 py-2">
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
