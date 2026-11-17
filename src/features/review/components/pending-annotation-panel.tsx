import { Loader2, PenLine, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useT } from '@/hooks/use-t';
import type { PendingAnnotation } from '../model/review';
import { CommentComposer } from './comment-composer';

interface PendingAnnotationPanelProps {
  pending: PendingAnnotation;
  onUndoStroke: () => void;
  /** Comentário novo com a marcação. */
  onSubmit: (body: string) => Promise<unknown>;
  /** Desenho: grava só o desenho, sem comentário (sem cartão). */
  onKeepDrawing: () => Promise<unknown>;
  onCancel: () => void;
}

/**
 * Comentário da marcação nova: ponto, trecho de texto ou desenho (traços,
 * formas e textos; cores e estilos ficam no painel flutuante sobre o PDF),
 * com "Desfazer traço" e "Manter só o desenho" (ou "só o texto").
 */
export function PendingAnnotationPanel({ pending, onUndoStroke, onSubmit, onKeepDrawing, onCancel }: PendingAnnotationPanelProps) {
  const { t } = useT();
  const [isKeeping, setIsKeeping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const draw = pending.kind === 'draw' ? pending : null;
  const hasTexts = Boolean(draw && draw.texts.some((box) => box.text.trim()));
  const textOnly = Boolean(draw && hasTexts && draw.strokes.length === 0);
  const isEmpty = Boolean(draw && draw.strokes.length === 0 && !hasTexts);
  const title =
    pending.kind === 'text'
      ? t('Comentário no trecho da página {page}', { page: pending.anchor.page })
      : pending.kind === 'draw'
        ? textOnly
          ? t('Comentário com texto na página {page}', { page: pending.page })
          : t('Comentário com desenho na página {page}', { page: pending.page })
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
      {draw && (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" disabled={isEmpty || isKeeping} onClick={() => void keepDrawing()}>
            {isKeeping ? <Loader2 className="animate-spin" /> : <PenLine />}
            {textOnly ? t('Manter só o texto') : t('Manter só o desenho')}
          </Button>
          {draw.strokes.length > 0 && (
            <Button type="button" variant="ghost" size="sm" onClick={onUndoStroke}>
              <Undo2 />
              {t('Desfazer traço')}
            </Button>
          )}
        </div>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
      <CommentComposer placeholder={t('Escreva o comentário')} submitLabel={t('Comentar')} autoFocus={!draw} onSubmit={onSubmit} onCancel={onCancel} />
    </div>
  );
}
