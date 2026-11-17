import { Move, RotateCw } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import type { TextBox } from '@shared/firestore/types';
import { useT } from '@/hooks/use-t';
import { MAX_TEXT_LENGTH } from '@/lib/pdf/drawing';
import { cn } from '@/lib/utils';
import { TEXT_CLASSES, normalizeRotation } from '../model/markup';
import { TextBoxBackdrop, boxFrameStyle, textStyleOf } from './text-box-view';

type Point = [number, number];

interface TextBoxEditorProps {
  box: TextBox;
  /** Tamanho da página na tela, em pixels. */
  size: { width: number; height: number };
  /** Ponto do ponteiro em pixels da página (a camada não gira, só a caixa). */
  toPage: (clientX: number, clientY: number) => Point;
  autoFocus?: boolean;
  onChange: (box: TextBox) => void;
  /** Esc ou Tab: a edição desta caixa termina. */
  onDone: () => void;
}

/** Menor caixa, em pixels: dá para pegar as alças. */
const MIN_SIZE = 24;

const rotate = ([x, y]: Point, degrees: number): Point => {
  const angle = (degrees * Math.PI) / 180;
  return [x * Math.cos(angle) - y * Math.sin(angle), x * Math.sin(angle) + y * Math.cos(angle)];
};

const round = (value: number) => Math.round(value * 10_000) / 10_000;

/**
 * Caixa de texto em edição: o texto se digita direto nela, e as alças movem
 * (canto superior esquerdo), redimensionam (canto inferior direito) e giram
 * (acima do centro, com encaixe a cada 15 graus; com Shift, sempre). As contas
 * são em pixels da página, e o resultado volta para frações de 0 a 1.
 */
export function TextBoxEditor({ box, size, toPage, autoFocus = false, onChange, onDone }: TextBoxEditorProps) {
  const { t } = useT();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dragRef = useRef<{ kind: 'move' | 'resize' | 'rotate'; start: Point; box: TextBox } | null>(null);
  const { width: W, height: H } = size;

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  // A caixa cresce para baixo quando o texto passa da altura (nunca encolhe sozinha).
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea || H === 0) return;
    const needed = textarea.scrollHeight / H;
    if (needed > box.rect.height + 0.0005) onChange({ ...box, rect: { ...box.rect, height: round(Math.min(needed, 1)) } });
  }, [box.text, box.size, box.font, box.bold, box.rect.width, H]);

  const start = (kind: 'move' | 'resize' | 'rotate') => (event: ReactPointerEvent<HTMLElement>) => {
    event.stopPropagation();
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { kind, start: toPage(event.clientX, event.clientY), box };
  };

  const move = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || W === 0) return;
    const pointer = toPage(event.clientX, event.clientY);
    const original = drag.box;
    const w = original.rect.width * W;
    const h = original.rect.height * H;
    const center: Point = [(original.rect.x + original.rect.width / 2) * W, (original.rect.y + original.rect.height / 2) * H];

    if (drag.kind === 'move') {
      // O centro fica dentro da página.
      const cx = Math.min(W, Math.max(0, center[0] + pointer[0] - drag.start[0]));
      const cy = Math.min(H, Math.max(0, center[1] + pointer[1] - drag.start[1]));
      onChange({ ...original, rect: { ...original.rect, x: round((cx - w / 2) / W), y: round((cy - h / 2) / H) } });
      return;
    }
    if (drag.kind === 'rotate') {
      const degrees = (Math.atan2(pointer[1] - center[1], pointer[0] - center[0]) * 180) / Math.PI + 90;
      onChange({ ...original, rotation: normalizeRotation(degrees, event.shiftKey) });
      return;
    }
    // Redimensionar: o canto superior esquerdo (já girado) fica parado e o oposto segue o ponteiro.
    const offset = rotate([-w / 2, -h / 2], original.rotation);
    const corner: Point = [center[0] + offset[0], center[1] + offset[1]];
    const local = rotate([pointer[0] - corner[0], pointer[1] - corner[1]], -original.rotation);
    const nextW = Math.max(MIN_SIZE, local[0]);
    const nextH = Math.max(MIN_SIZE, local[1]);
    const half = rotate([nextW / 2, nextH / 2], original.rotation);
    const nextCenter: Point = [corner[0] + half[0], corner[1] + half[1]];
    onChange({
      ...original,
      rect: { x: round((nextCenter[0] - nextW / 2) / W), y: round((nextCenter[1] - nextH / 2) / H), width: round(nextW / W), height: round(nextH / H) },
    });
  };

  const end = (event: ReactPointerEvent<HTMLElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const handle = 'pointer-events-auto absolute flex touch-none items-center justify-center rounded-full border border-ring bg-background text-foreground shadow-sm [&_svg]:size-3.5';
  const dragProps = (kind: 'move' | 'resize' | 'rotate') => ({ onPointerDown: start(kind), onPointerMove: move, onPointerUp: end, onPointerCancel: end });

  if (W === 0) return null;
  return (
    <div
      style={boxFrameStyle(box)}
      className="pointer-events-auto absolute outline outline-2 outline-offset-2 outline-ring"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <TextBoxBackdrop box={box} pageWidth={W} />
      <textarea
        ref={textareaRef}
        value={box.text}
        maxLength={MAX_TEXT_LENGTH}
        aria-label={t('Texto da caixa')}
        placeholder={t('Escreva aqui')}
        spellCheck
        className={cn(
          'relative block size-full resize-none overflow-hidden whitespace-pre-wrap break-words border-0 bg-transparent outline-none [overflow-wrap:anywhere] placeholder:text-muted-foreground/70',
          TEXT_CLASSES[box.color],
        )}
        style={textStyleOf(box, W)}
        onChange={(event) => onChange({ ...box, text: event.target.value })}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            onDone();
          }
        }}
      />
      <button type="button" aria-label={t('Mover o texto')} title={t('Arraste para mover')} className={cn(handle, '-left-3 -top-3 size-6 cursor-move')} {...dragProps('move')}>
        <Move />
      </button>
      <button
        type="button"
        aria-label={t('Redimensionar o texto')}
        title={t('Arraste para redimensionar')}
        className={cn(handle, '-bottom-2 -right-2 size-4 cursor-nwse-resize rounded-sm')}
        {...dragProps('resize')}
      />
      <span aria-hidden className="pointer-events-none absolute -top-6 left-1/2 h-6 w-px -translate-x-1/2 bg-ring" />
      <button
        type="button"
        aria-label={t('Girar o texto')}
        title={t('Arraste para girar (Shift encaixa a cada 15 graus)')}
        className={cn(handle, '-top-9 left-1/2 size-6 -translate-x-1/2 cursor-grab active:cursor-grabbing')}
        {...dragProps('rotate')}
      >
        <RotateCw />
      </button>
    </div>
  );
}
