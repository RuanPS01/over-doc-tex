import { CheckCircle2, RotateCcw } from 'lucide-react';
import { forwardRef } from 'react';
import { Button } from '@/components/ui/button';
import { MarkdownContent } from '@/components/common/markdown-content';
import { cn } from '@/lib/utils';
import { useComments } from '../hooks/use-threads';
import type { ThreadSummary } from '../model/review';
import { CommentComposer } from './comment-composer';

const TIME_FORMAT = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

interface ThreadCardProps {
  projectId: string;
  reviewId: string;
  thread: ThreadSummary;
  number: number;
  isSelected: boolean;
  canWrite: boolean;
  onSelect: () => void;
  onReply: (body: string) => Promise<unknown>;
  onStatusChange: (status: 'open' | 'resolved') => Promise<unknown>;
}

/** Uma thread: comentários, resposta e resolver ou reabrir. */
export const ThreadCard = forwardRef<HTMLLIElement, ThreadCardProps>(function ThreadCard(
  { projectId, reviewId, thread, number, isSelected, canWrite, onSelect, onReply, onStatusChange },
  ref,
) {
  const { data: comments = [] } = useComments(projectId, reviewId, thread.id);
  const isResolved = thread.status === 'resolved';

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
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">Página {thread.anchor.page}</span>
        {isResolved && (
          <span className="shrink-0 text-xs text-success">
            {thread.resolution?.fixedInSnapshotId ? 'Corrigida' : 'Resolvida'}
          </span>
        )}
      </button>
      <ol className="flex flex-col gap-3 border-t px-3 py-2">
        {comments.map((comment) => (
          <li key={comment.id} className="flex flex-col gap-0.5">
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{comment.authorName}</span>
              {comment.authorRole === 'reviewer' ? ' (revisor)' : ''}
              {comment.createdAt ? ` · ${TIME_FORMAT.format(comment.createdAt)}` : ''}
            </p>
            <MarkdownContent markdown={comment.body} className="[&_p]:my-0.5" />
          </li>
        ))}
      </ol>
      {isSelected && canWrite && (
        <div className="flex flex-col gap-2 border-t px-3 py-2">
          <CommentComposer placeholder="Responder" submitLabel="Responder" onSubmit={onReply} />
          <Button variant="ghost" size="sm" className="self-start" onClick={() => void onStatusChange(isResolved ? 'open' : 'resolved')}>
            {isResolved ? <RotateCcw /> : <CheckCircle2 />}
            {isResolved ? 'Reabrir' : 'Marcar como resolvida'}
          </Button>
        </div>
      )}
    </li>
  );
});
