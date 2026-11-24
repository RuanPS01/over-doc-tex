import { Loader2, Pencil, RotateCw, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Drawing } from '@shared/firestore/types';
import { Button } from '@/components/ui/button';
import { useT } from '@/hooks/use-t';
import { moveDrawing, rotateDrawing, scaleDrawing, wrapDegrees } from '@/lib/pdf/drawing';
import { cn } from '@/lib/utils';
import type { ThreadSummary } from '../model/review';
import { DrawingView } from './drawing-view';

interface DrawingMarkProps {
  thread: ThreadSummary;
  /** Tamanho da página na tela, em pixels. */
  size: { width: number; height: number };
  /** Estilo mudado no painel e ainda não gravado: aparece no lugar do gravado. */
  preview: Drawing | null;
  isSelected: boolean;
  /** Clicável só em "Selecionar texto" (nas outras ferramentas o clique marca ou desenha). */
  isInteractive: boolean;
  /** Quem criou o desenho ou edita o projeto: move, gira, redimensiona, edita e apaga. */
  canManage: boolean;
  onSelect: () => void;
  onDelete: () => Promise<unknown>;
  /** Abre o desenho para editar (formas, textos e o que mais for desenhado). */
  onEdit: () => void;
  /** Clique no texto com a ferramenta "Texto" (ou duplo clique na seleção): edita o texto ali mesmo. */
  onEditText?: () => void;
  /** Desenho movido, girado ou redimensionado, ao soltar o ponteiro. */
  onTransform: (drawing: Drawing) => void;
}

type DragKind = 'move' | 'resize' | 'rotate';

/** Menor lado da caixa ao redimensionar, em pixels. */
const MIN_SIZE = 12;
/** Antes disso o ponteiro ainda conta como clique. */
const DRAG_THRESHOLD = 3;

/**
 * Desenho sem comentário: sem número nem cartão. Clicar no traço ou no texto
 * seleciona; para quem pode, a seleção vira uma moldura que arrasta (mover),
 * gira (alça de cima) e redimensiona (canto de baixo, com Shift na mesma
 * proporção), além de "Editar" e "Apagar". O resultado é gravado ao soltar.
 */
export function DrawingMark({ thread, size, preview, isSelected, isInteractive, canManage, onSelect, onDelete, onEdit, onEditText, onTransform }: DrawingMarkProps) {
  const { t } = useT();
  const [isDeleting, setIsDeleting] = useState(false);
  const [dragged, setDraggedState] = useState<Drawing | null>(null);
  // O último resultado do arraste, lido ao soltar (sem efeito colateral dentro do setState).
  const draggedRef = useRef<Drawing | null>(null);
  const setDragged = (next: Drawing | null) => {
    draggedRef.current = next;
    setDraggedState(next);
  };
  const dragRef = useRef<{ kind: DragKind; start: [number, number]; startAngle: number; original: Drawing; moved: boolean } | null>(null);
  const saved = thread.anchor.type === 'pin' ? thread.anchor.drawing : null;

  // A marcação gravada mudou (a transformação chegou ao banco, ou desfazer): a prévia do arraste sai.
  useEffect(() => setDragged(null), [saved]);

  if (!saved) return null;
  const drawing = dragged ?? preview ?? saved;
  const { bounds } = drawing;
  const { width: W, height: H } = size;
  const aspect = W > 0 ? H / W : 1;
  const editable = isSelected && isInteractive && canManage && W > 0;
  // Os botões ficam acima do desenho; perto do topo da página, abaixo dele.
  const above = bounds.y > 0.08;

  const remove = async () => {
    setIsDeleting(true);
    try {
      await onDelete();
    } finally {
      setIsDeleting(false);
    }
  };

  const pointOf = (event: ReactPointerEvent<HTMLElement>): [number, number] => {
    const layer = event.currentTarget.closest('[data-annotation-layer]')?.getBoundingClientRect();
    return layer ? [event.clientX - layer.left, event.clientY - layer.top] : [0, 0];
  };
  const center = (from: Drawing): [number, number] => [(from.bounds.x + from.bounds.width / 2) * W, (from.bounds.y + from.bounds.height / 2) * H];
  const angleAt = (from: Drawing, [x, y]: [number, number]) => {
    const [cx, cy] = center(from);
    return (Math.atan2(y - cy, x - cx) * 180) / Math.PI;
  };

  const start = (kind: DragKind) => (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointOf(event);
    dragRef.current = { kind, start: point, startAngle: angleAt(drawing, point), original: drawing, moved: false };
  };

  const move = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const point = pointOf(event);
    const dx = point[0] - drag.start[0];
    const dy = point[1] - drag.start[1];
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    drag.moved = true;
    const { original } = drag;
    if (drag.kind === 'move') {
      setDragged(moveDrawing(original, dx / W, dy / H));
    } else if (drag.kind === 'rotate') {
      const raw = angleAt(original, point) - drag.startAngle;
      // Encaixe a cada 15 graus perto deles; com Shift, sempre.
      const snapped = Math.round(raw / 15) * 15;
      const degrees = event.shiftKey || Math.abs(wrapDegrees(raw - snapped)) < 3 ? snapped : raw;
      const pivot = { x: original.bounds.x + original.bounds.width / 2, y: original.bounds.y + original.bounds.height / 2 };
      setDragged(rotateDrawing(original, degrees, pivot, aspect));
    } else {
      // O canto de cima à esquerda fica parado; o de baixo à direita segue o ponteiro.
      const b = original.bounds;
      const widthPx = Math.max(MIN_SIZE, point[0] - b.x * W);
      const heightPx = Math.max(MIN_SIZE, point[1] - b.y * H);
      const flatX = b.width <= 0.001;
      const flatY = b.height <= 0.001;
      let sx = flatX ? 1 : widthPx / (b.width * W);
      let sy = flatY ? 1 : heightPx / (b.height * H);
      // Linha reta (sem largura ou sem altura) e Shift: a mesma escala nos dois sentidos.
      if (flatX) sx = sy;
      else if (flatY) sy = sx;
      else if (event.shiftKey) sx = sy = Math.max(sx, sy);
      setDragged(scaleDrawing(original, sx, sy, { x: b.x, y: b.y }, aspect));
    }
  };

  const end = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    // A prévia fica até a marcação gravada mudar (o Firestore aplica na tela antes de confirmar).
    if (drag.moved && draggedRef.current) onTransform(draggedRef.current);
  };

  const dragProps = (kind: DragKind) => ({ onPointerDown: start(kind), onPointerMove: move, onPointerUp: end, onPointerCancel: end });
  const handle = 'pointer-events-auto absolute flex touch-none items-center justify-center rounded-full border border-ring bg-background text-foreground shadow-sm [&_svg]:size-3.5';
  const hasText = Boolean(drawing.texts?.length);

  return (
    <>
      <DrawingView
        strokes={drawing.strokes}
        texts={drawing.texts}
        size={size}
        onClick={isInteractive ? onSelect : onEditText}
        onDoubleClick={isInteractive && canManage && hasText ? onEditText : undefined}
        label={onEditText && !isInteractive ? t('Editar este texto') : t('Desenho sem comentário')}
      />
      {isSelected && (
        <>
          <div
            role={editable ? 'group' : undefined}
            aria-label={editable ? t('Desenho selecionado: arraste para mover') : undefined}
            aria-hidden={editable ? undefined : true}
            title={editable ? t('Arraste para mover') : undefined}
            style={{ left: `${bounds.x * 100}%`, top: `${bounds.y * 100}%`, width: `${bounds.width * 100}%`, height: `${bounds.height * 100}%` }}
            className={cn(
              'absolute -m-1.5 box-content rounded border-2 border-dashed border-ring p-1.5',
              editable ? 'pointer-events-auto cursor-move touch-none' : 'pointer-events-none',
            )}
            {...(editable ? dragProps('move') : {})}
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => {
              event.stopPropagation();
              if (editable && hasText) onEditText?.();
            }}
          >
            {editable && (
              <>
                <span aria-hidden className="pointer-events-none absolute -top-6 left-1/2 h-5 w-px -translate-x-1/2 bg-ring" />
                <button
                  type="button"
                  aria-label={t('Girar o desenho')}
                  title={t('Arraste para girar (Shift encaixa a cada 15 graus)')}
                  className={cn(handle, '-top-9 left-1/2 size-6 -translate-x-1/2 cursor-grab active:cursor-grabbing')}
                  {...dragProps('rotate')}
                >
                  <RotateCw />
                </button>
                <button
                  type="button"
                  aria-label={t('Redimensionar o desenho')}
                  title={t('Arraste para redimensionar (Shift mantém a proporção)')}
                  className={cn(handle, '-bottom-2 -right-2 size-4 cursor-nwse-resize rounded-sm')}
                  {...dragProps('resize')}
                />
              </>
            )}
          </div>
          {canManage && isInteractive && (
            <span
              style={{ left: `${(bounds.x + bounds.width) * 100}%`, top: `${(above ? bounds.y : bounds.y + bounds.height) * 100}%` }}
              className={`pointer-events-auto absolute flex -translate-x-full gap-1 ${above ? '-translate-y-[calc(100%+2.75rem)]' : 'translate-y-3'}`}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <Button
                size="sm"
                variant="secondary"
                className="h-7 gap-1 px-2 text-xs shadow-md"
                onClick={(event) => {
                  event.stopPropagation();
                  if (hasText && drawing.strokes.length === 0) onEditText?.();
                  else onEdit();
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
