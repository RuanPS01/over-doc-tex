import { useT } from '@/hooks/use-t';
import type { PendingAnnotation } from '../model/review';
import { CommentComposer } from './comment-composer';

interface PendingAnnotationPanelProps {
  /** Ponto ou trecho de texto: desenhos e textos flutuantes são gravados sozinhos, sem comentário. */
  pending: Exclude<PendingAnnotation, { kind: 'draw' }>;
  /** Comentário novo com a marcação. */
  onSubmit: (body: string) => Promise<unknown>;
  onCancel: () => void;
}

/**
 * Comentário da marcação nova: um ponto ou um trecho de texto (com a
 * citação). Para comentar um desenho ou um texto flutuante, marca-se um ponto
 * sobre ele.
 */
export function PendingAnnotationPanel({ pending, onSubmit, onCancel }: PendingAnnotationPanelProps) {
  const { t } = useT();
  const title =
    pending.kind === 'text'
      ? t('Comentário no trecho da página {page}', { page: pending.anchor.page })
      : t('Novo comentário na página {page}', { page: pending.page });

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-annotation-3 bg-card p-3">
      <p className="text-xs font-medium">{title}</p>
      {pending.kind === 'text' && (
        <blockquote className="line-clamp-3 border-l-2 border-annotation-1 pl-2 text-xs italic text-muted-foreground">{pending.anchor.quote.exact}</blockquote>
      )}
      <CommentComposer placeholder={t('Escreva o comentário')} submitLabel={t('Comentar')} autoFocus onSubmit={onSubmit} onCancel={onCancel} />
    </div>
  );
}
