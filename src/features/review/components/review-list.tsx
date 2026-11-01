import { Loader2, MessageSquare } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'wouter';
import { useT } from '@/hooks/use-t';
import { cn } from '@/lib/utils';
import { REVIEW_STATUS_LABELS, type ReviewSummary, reviewerLabel } from '../model/review';

interface ReviewListProps {
  reviews: ReviewSummary[];
  isPending: boolean;
  /** Mostra o nome do projeto (lista "Revisões para você"). */
  showProject?: boolean;
  emptyText: string;
}

/** Fila de revisões: cada item abre a tela da revisão. */
export function ReviewList({ reviews, isPending, showProject = false, emptyText }: ReviewListProps) {
  const { t, locale } = useT();
  const dateFormat = useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle: 'short' }), [locale]);
  if (isPending) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        {t('Carregando as revisões')}
      </p>
    );
  }
  if (reviews.length === 0) return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  return (
    <ul className="flex flex-col gap-2">
      {reviews.map((review) => (
        <li key={`${review.projectId}/${review.id}`}>
          <Link
            href={`/p/${review.projectId}/reviews/${review.id}`}
            className="flex min-w-0 items-start gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-muted"
          >
            <MessageSquare className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-sm font-medium">
                #{review.number} {review.title}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {[
                  showProject ? review.projectName : reviewerLabel(review),
                  t('versão {version}', { version: review.snapshotLabel }),
                  review.requestedAt ? dateFormat.format(review.requestedAt) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </span>
            <span
              className={cn(
                'shrink-0 rounded px-1.5 py-0.5 text-[11px]',
                review.status === 'approved' ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground',
              )}
            >
              {t(REVIEW_STATUS_LABELS[review.status])}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
