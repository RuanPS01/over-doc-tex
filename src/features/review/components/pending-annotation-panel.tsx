import { Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AnnotationColor } from '@shared/firestore/types';
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
  onSubmit: (body: string) => Promise<unknown>;
  onCancel: () => void;
}

/** Comentário da marcação nova: ponto, trecho de texto ou desenho (com cor e desfazer traço). */
export function PendingAnnotationPanel({ pending, onColor, onUndoStroke, onSubmit, onCancel }: PendingAnnotationPanelProps) {
  const title =
    pending.kind === 'text'
      ? `Comentário no trecho da página ${pending.anchor.page}`
      : pending.kind === 'draw'
        ? `Comentário com desenho na página ${pending.page}`
        : `Novo comentário na página ${pending.page}`;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-annotation-3 bg-card p-3">
      <p className="text-xs font-medium">{title}</p>
      {pending.kind === 'text' && (
        <blockquote className="line-clamp-3 border-l-2 border-annotation-1 pl-2 text-xs italic text-muted-foreground">{pending.anchor.quote.exact}</blockquote>
      )}
      {pending.kind === 'draw' && (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Cor</span>
          {ANNOTATION_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={ANNOTATION_COLOR_LABELS[color]}
              aria-pressed={pending.color === color}
              onClick={() => onColor(color)}
              className={cn('size-6 rounded-full border-2', SWATCH_CLASSES[color], pending.color === color ? 'border-foreground' : 'border-transparent')}
            />
          ))}
          <span className="flex-1" />
          <Button type="button" variant="ghost" size="sm" disabled={pending.strokes.length === 0} onClick={onUndoStroke}>
            <Undo2 />
            Desfazer traço
          </Button>
        </div>
      )}
      <CommentComposer placeholder="Escreva o comentário" submitLabel="Comentar" autoFocus={pending.kind !== 'draw'} onSubmit={onSubmit} onCancel={onCancel} />
    </div>
  );
}
