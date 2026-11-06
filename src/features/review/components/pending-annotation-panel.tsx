import { Loader2, PenLine, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { AnnotationColor } from '@shared/firestore/types';
import { useT } from '@/hooks/use-t';
import { cn } from '@/lib/utils';
import { ANNOTATION_COLOR_LABELS, ANNOTATION_COLORS, type PendingAnnotation } from '../model/review';
import { CommentComposer } from './comment-composer';

const SWATCH_CLASSES: Record<AnnotationColor, string> = {
  'annotation-1': 'bg-annotation-1',
  'annotation-2': 'bg-annotation-2',
  'annotation-3': 'bg-annotation-3',
  'annotation-4': 'bg-annotation-4',
};

interface PendingAnnotationPanelProps {
  pending: PendingAnnotation;
  onColor: (color: AnnotationColor) => void;
  onUndoStroke: () => void;
  /** Comentário novo com a marcação. */
  onSubmit: (body: string) => Promise<unknown>;
  /** Desenho: grava só o desenho, sem comentário (sem cartão). */
  onKeepDrawing: () => Promise<unknown>;
  onCancel: () => void;
}

/** Comentário da marcação nova: ponto, trecho de texto ou desenho (com cor, desfazer traço e "Manter só o desenho"). */
export function PendingAnnotationPanel({ pending, onColor, onUndoStroke, onSubmit, onKeepDrawing, onCancel }: PendingAnnotationPanelProps) {
  const { t } = useT();
  const [isKeeping, setIsKeeping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const title =
    pending.kind === 'text'
      ? t('Comentário no trecho da página {page}', { page: pending.anchor.page })
      : pending.kind === 'draw'
        ? t('Comentário com desenho na página {page}', { page: pending.page })
        : t('Novo comentário na página {page}', { page: pending.page });

  const keepDrawing = async () => {
    setIsKeeping(true);
    setError(null);
    try {
      await onKeepDrawing();
    } catch {
      setError(t('Não foi possível salvar. Confira a conexão e tente de novo.'));
    } finally {
      setIsKeeping(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-annotation-3 bg-card p-3">
      <p className="text-xs font-medium">{title}</p>
      {pending.kind === 'text' && (
        <blockquote className="line-clamp-3 border-l-2 border-annotation-1 pl-2 text-xs italic text-muted-foreground">{pending.anchor.quote.exact}</blockquote>
      )}
      {pending.kind === 'draw' && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">{t('Cor')}</span>
          {ANNOTATION_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={t(ANNOTATION_COLOR_LABELS[color])}
              aria-pressed={pending.color === color}
              onClick={() => onColor(color)}
              className={cn('size-6 rounded-full border-2', SWATCH_CLASSES[color], pending.color === color ? 'border-foreground' : 'border-transparent')}
            />
          ))}
          <span className="flex-1" />
          <Button type="button" variant="ghost" size="sm" disabled={pending.strokes.length === 0} onClick={onUndoStroke}>
            <Undo2 />
            {t('Desfazer traço')}
          </Button>
        </div>
      )}
      {pending.kind === 'draw' && (
        <Button type="button" variant="outline" size="sm" className="self-start" disabled={pending.strokes.length === 0 || isKeeping} onClick={() => void keepDrawing()}>
          {isKeeping ? <Loader2 className="animate-spin" /> : <PenLine />}
          {t('Manter só o desenho')}
        </Button>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
      <CommentComposer placeholder={t('Escreva o comentário')} submitLabel={t('Comentar')} autoFocus={pending.kind !== 'draw'} onSubmit={onSubmit} onCancel={onCancel} />
    </div>
  );
}
