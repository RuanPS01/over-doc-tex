import { Loader2, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useT } from '@/hooks/use-t';
import type { ThreadSummary } from '../model/review';
import { DrawingView } from './drawing-view';

interface DrawingMarkProps {
  thread: ThreadSummary;
  /** Tamanho da página na tela, em pixels. */
  size: { width: number; height: number };
  isSelected: boolean;
  /** Clicável só em "Selecionar texto" (nas outras ferramentas o clique marca ou desenha). */
  isInteractive: boolean;
  /** Quem criou o desenho ou edita o projeto: aparece "Apagar desenho" ao selecionar. */
  canDelete: boolean;
  onSelect: () => void;
  onDelete: () => Promise<unknown>;
  /** Abre o desenho para editar (formas, textos, mover, girar). */
  onEdit: () => void;
}

/**
 * Desenho sem comentário ("Manter só o desenho"): sem número nem cartão.
 * Clicar no traço ou no texto seleciona (contorno tracejado) e, para quem
 * pode, mostra "Editar" e "Apagar" junto dele.
 */
export function DrawingMark({ thread, size, isSelected, isInteractive, canDelete, onSelect, onDelete, onEdit }: DrawingMarkProps) {
  const { t } = useT();
  const [isDeleting, setIsDeleting] = useState(false);
  if (thread.anchor.type !== 'pin' || !thread.anchor.drawing) return null;
  const { bounds, strokes, texts } = thread.anchor.drawing;
  // O botão fica acima do desenho; perto do topo da página, abaixo dele.
  const above = bounds.y > 0.06;

  const remove = async () => {
    setIsDeleting(true);
    try {
      await onDelete();
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <DrawingView strokes={strokes} texts={texts} size={size} onClick={isInteractive ? onSelect : undefined} label={t('Desenho sem comentário')} />
      {isSelected && (
        <>
          <span
            aria-hidden
            style={{ left: `${bounds.x * 100}%`, top: `${bounds.y * 100}%`, width: `${bounds.width * 100}%`, height: `${bounds.height * 100}%` }}
            className="pointer-events-none absolute -m-1 box-content rounded border-2 border-dashed border-ring p-1"
          />
          {canDelete && (
            <span
              style={{ left: `${(bounds.x + bounds.width) * 100}%`, top: `${(above ? bounds.y : bounds.y + bounds.height) * 100}%` }}
              className={`pointer-events-auto absolute flex -translate-x-full gap-1 ${above ? '-translate-y-[calc(100%+6px)]' : 'translate-y-1.5'}`}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <Button
                size="sm"
                variant="secondary"
                className="h-7 gap-1 px-2 text-xs shadow-md"
                onClick={(event) => {
                  event.stopPropagation();
                  onEdit();
                }}
              >
                <Pencil />
                {t('Editar')}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="h-7 gap-1 px-2 text-xs shadow-md"
                disabled={isDeleting}
                onClick={(event) => {
                  event.stopPropagation();
                  void remove();
                }}
              >
                {isDeleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
                {t('Apagar desenho')}
              </Button>
            </span>
          )}
        </>
      )}
    </>
  );
}
