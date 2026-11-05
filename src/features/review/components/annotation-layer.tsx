import { useRef, useState, type PointerEvent } from 'react';
import type { AnnotationColor, NormalizedPoint, Stroke } from '@shared/firestore/types';
import { useT } from '@/hooks/use-t';
import { movePin, svgPoints } from '@/lib/pdf/drawing';
import { cn } from '@/lib/utils';
import { usePinDrag } from '../hooks/use-pin-drag';
import type { PendingAnnotation, ReviewTool, ThreadSummary } from '../model/review';

/** Classes inteiras (o Tailwind só gera o que aparece escrito no código). */
const STROKE_CLASSES: Record<AnnotationColor, string> = {
  'annotation-1': 'stroke-annotation-1',
  'annotation-2': 'stroke-annotation-2',
  'annotation-3': 'stroke-annotation-3',
  'annotation-4': 'stroke-annotation-4',
};

interface AnnotationLayerProps {
  page: number;
  /** Threads desta página, com o número exibido. */
  threads: Array<{ thread: ThreadSummary; number: number }>;
  pending: PendingAnnotation | null;
  tool: ReviewTool;
  selectedThreadId: string | null;
  onPlacePin: (page: number, point: { x: number; y: number }) => void;
  /** Traço terminado (pontos normalizados [x, y]). */
  onStroke: (page: number, points: Array<[number, number]>) => void;
  onSelect: (threadId: string) => void;
  /** Pins (com ou sem desenho) que a pessoa pode arrastar: quem criou a thread ou edita o projeto. */
  canMove: (thread: ThreadSummary) => boolean;
  /** Pin solto em outro lugar da página (o desenho vai junto). */
  onMovePin: (thread: ThreadSummary, point: NormalizedPoint) => Promise<unknown>;
  /** Thread esperando a marcação nova: a atual aparece esmaecida. */
  relocatingThreadId: string | null;
}

const clamp = (value: number) => Math.min(1, Math.max(0, value));

function Strokes({ strokes, faded = false }: { strokes: readonly Stroke[]; faded?: boolean }) {
  return (
    <svg viewBox="0 0 1 1" preserveAspectRatio="none" className={cn('absolute inset-0 size-full', faded && 'opacity-60')} aria-hidden>
      {strokes.map((stroke, index) => (
        <polyline
          key={index}
          points={svgPoints(stroke.points)}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          className={STROKE_CLASSES[stroke.color]}
          style={{ strokeWidth: 3 }}
        />
      ))}
    </svg>
  );
}

/**
 * Tudo que fica sobre a página, em coordenadas de 0 a 1 (acompanha o zoom
 * sem recalcular nada): destaques dos trechos, desenhos, pins numerados e a
 * marcação pendente. Com "Ponto", o clique posiciona o pin; com "Desenhar",
 * o ponteiro desenha (touch-action: none só aqui, para não travar a rolagem
 * fora do modo de desenho). Em "Selecionar", a camada deixa o clique passar
 * para a camada de texto.
 */
export function AnnotationLayer({
  page,
  threads,
  pending,
  tool,
  selectedThreadId,
  onPlacePin,
  onStroke,
  onSelect,
  canMove,
  onMovePin,
  relocatingThreadId,
}: AnnotationLayerProps) {
  const { t } = useT();
  const rootRef = useRef<HTMLDivElement>(null);
  const pinDrag = usePinDrag(rootRef, (threadId, point) => {
    const thread = threads.find((item) => item.thread.id === threadId)?.thread;
    return thread ? onMovePin(thread, point) : Promise.resolve();
  });
  const [live, setLive] = useState<Array<[number, number]> | null>(null);
  const liveRef = useRef<Array<[number, number]> | null>(null);
  const pendingColor: AnnotationColor = pending?.kind === 'draw' ? pending.color : 'annotation-2';

  const pointOf = (event: PointerEvent<HTMLDivElement>): [number, number] => {
    const box = event.currentTarget.getBoundingClientRect();
    return [clamp((event.clientX - box.left) / box.width), clamp((event.clientY - box.top) / box.height)];
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (tool === 'pin') {
      const [x, y] = pointOf(event);
      onPlacePin(page, { x: Math.round(x * 10_000) / 10_000, y: Math.round(y * 10_000) / 10_000 });
      return;
    }
    if (tool !== 'draw') return;
    event.currentTarget.setPointerCapture(event.pointerId);
    liveRef.current = [pointOf(event)];
    setLive(liveRef.current);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (tool !== 'draw' || !liveRef.current) return;
    liveRef.current = [...liveRef.current, pointOf(event)];
    setLive(liveRef.current);
  };

  const finishStroke = () => {
    const points = liveRef.current;
    liveRef.current = null;
    setLive(null);
    if (points && points.length >= 2) onStroke(page, points);
  };

  return (
    <div
      ref={rootRef}
      className={cn(
        'absolute inset-0 z-10',
        tool === 'select' && 'pointer-events-none',
        tool === 'pin' && 'cursor-crosshair',
        tool === 'draw' && 'cursor-crosshair touch-none',
      )}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishStroke}
      onPointerCancel={finishStroke}
    >
      {threads.map(({ thread, number }) => {
        // Trecho que não foi reencontrado na versão nova não tem lugar nesta página.
        if (thread.status === 'outdated') return null;
        const isResolved = thread.status === 'resolved';
        const isSelected = thread.id === selectedThreadId;
        // Semitransparente para não tampar o texto embaixo; fica opaco no hover, no foco e quando selecionado.
        const badge = cn(
          'pointer-events-auto absolute flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-xs font-semibold shadow-sm transition-[transform,opacity] hover:opacity-100 focus-visible:opacity-100',
          isResolved ? 'border bg-muted text-foreground opacity-45' : 'bg-annotation-3 text-background opacity-60',
          isSelected && 'scale-125 opacity-100 ring-2 ring-ring ring-offset-2',
        );
        const select = (event: { stopPropagation: () => void }) => {
          event.stopPropagation();
          // Soltar o pin depois de arrastar não conta como clique.
          if (pinDrag.consumeClick()) return;
          onSelect(thread.id);
        };
        const fade = thread.id === relocatingThreadId && 'opacity-30';
        if (thread.anchor.type === 'text') {
          const first = thread.anchor.rects[0];
          return (
            <div key={thread.id} className={cn(fade)}>
              {thread.anchor.rects.map((rect, index) => (
                <span
                  key={index}
                  aria-hidden
                  style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` }}
                  className={cn('absolute rounded-sm mix-blend-multiply', isSelected ? 'bg-annotation-1/60' : 'bg-annotation-1/35', isResolved && 'bg-muted/60')}
                />
              ))}
              {first && (
                <button
                  type="button"
                  aria-label={t('Comentário {number}', { number })}
                  style={{ left: `${first.x * 100}%`, top: `${first.y * 100}%` }}
                  className={badge}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={select}
                >
                  {number}
                </button>
              )}
            </div>
          );
        }
        // Pin arrastável: o ponto e o desenho seguem o ponteiro enquanto ele é arrastado.
        const movable = canMove(thread);
        const isDragging = pinDrag.drag?.threadId === thread.id;
        const shown = isDragging ? movePin(thread.anchor.point, thread.anchor.drawing, pinDrag.drag!.point) : thread.anchor;
        return (
          <div key={thread.id} className={cn(fade)}>
            {shown.drawing && <Strokes strokes={shown.drawing.strokes} faded={isResolved} />}
            <button
              type="button"
              aria-label={t('Comentário {number}', { number })}
              title={movable ? t('Clique para abrir; arraste para mudar de lugar') : undefined}
              style={{ left: `${shown.point.x * 100}%`, top: `${shown.point.y * 100}%` }}
              className={cn(badge, movable && 'cursor-grab touch-none active:cursor-grabbing', isDragging && 'scale-110 cursor-grabbing opacity-100 shadow-md')}
              {...(movable ? pinDrag.bind(thread.id, thread.anchor.point) : { onPointerDown: (event: PointerEvent<HTMLButtonElement>) => event.stopPropagation() })}
              onClick={select}
            >
              {number}
            </button>
          </div>
        );
      })}

      {pending?.kind === 'pin' && pending.page === page && (
        <span
          aria-hidden
          style={{ left: `${pending.point.x * 100}%`, top: `${pending.point.y * 100}%` }}
          className="absolute size-7 -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full border-2 border-annotation-3 bg-annotation-3/30"
        />
      )}
      {pending?.kind === 'text' &&
        pending.anchor.page === page &&
        pending.anchor.rects.map((rect, index) => (
          <span
            key={index}
            aria-hidden
            style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` }}
            className="absolute animate-pulse rounded-sm bg-annotation-3/30"
          />
        ))}
      {pending?.kind === 'draw' && pending.page === page && <Strokes strokes={pending.strokes} />}
      {live && <Strokes strokes={[{ tool: 'pen', color: pendingColor, width: 0.004, points: live.flat() }]} />}
    </div>
  );
}
