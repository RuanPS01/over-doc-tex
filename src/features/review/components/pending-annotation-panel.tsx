import { Check, Loader2, Undo2 } from 'lucide-react';
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
  /** Nulo só ao refazer a marcação, enquanto a pessoa ainda não marcou nada. */
  pending: PendingAnnotation | null;
  /** "Refazer a marcação" do comentário com este número: sem caixa de texto, a conversa continua a mesma. */
  relocateNumber?: number;
  onColor: (color: AnnotationColor) => void;
  onUndoStroke: () => void;
  /** Comentário novo com a marcação. */
  onSubmit: (body: string) => Promise<unknown>;
  /** Refazer a marcação: grava a marcação nova na thread. */
  onSave?: () => Promise<unknown>;
  onCancel: () => void;
}

/** Comentário da marcação nova (ponto, trecho de texto ou desenho, com cor e desfazer traço) ou a marcação nova de um comentário. */
export function PendingAnnotationPanel({ pending, relocateNumber, onColor, onUndoStroke, onSubmit, onSave, onCancel }: PendingAnnotationPanelProps) {
  const { t } = useT();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isRelocating = relocateNumber !== undefined;
  const title = isRelocating
    ? t('Nova marcação do comentário {number}', { number: relocateNumber })
    : pending?.kind === 'text'
      ? t('Comentário no trecho da página {page}', { page: pending.anchor.page })
      : pending?.kind === 'draw'
        ? t('Comentário com desenho na página {page}', { page: pending.page })
        : t('Novo comentário na página {page}', { page: pending?.page ?? 1 });

  const save = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await onSave?.();
    } catch {
      setError(t('Não foi possível salvar. Confira a conexão e tente de novo.'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-annotation-3 bg-card p-3">
      <p className="text-xs font-medium">{title}</p>
      {isRelocating && !pending && (
        <p className="text-xs text-muted-foreground">{t('Selecione um trecho do PDF, ou use Ponto ou Desenhar no topo. A conversa continua a mesma.')}</p>
      )}
      {pending?.kind === 'text' && (
        <blockquote className="line-clamp-3 border-l-2 border-annotation-1 pl-2 text-xs italic text-muted-foreground">{pending.anchor.quote.exact}</blockquote>
      )}
      {isRelocating && pending && pending.kind !== 'text' && (
        <p className="text-xs text-muted-foreground">
          {pending.kind === 'draw' ? t('Desenho na página {page}', { page: pending.page }) : t('Ponto na página {page}', { page: pending.page })}
        </p>
      )}
      {pending?.kind === 'draw' && (
        <div className="flex items-center gap-1.5">
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
      {isRelocating ? (
        <>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" disabled={isSaving} onClick={onCancel}>
              {t('Cancelar')}
            </Button>
            <Button type="button" size="sm" disabled={!pending || isSaving} onClick={() => void save()}>
              {isSaving ? <Loader2 className="animate-spin" /> : <Check />}
              {t('Salvar marcação')}
            </Button>
          </div>
        </>
      ) : (
        <CommentComposer placeholder={t('Escreva o comentário')} submitLabel={t('Comentar')} autoFocus={pending?.kind !== 'draw'} onSubmit={onSubmit} onCancel={onCancel} />
      )}
    </div>
  );
}
