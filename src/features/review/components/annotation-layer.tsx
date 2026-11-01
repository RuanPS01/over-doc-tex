import { useRef, useState, type PointerEvent } from 'react';
import type { AnnotationColor, Stroke } from '@shared/firestore/types';
import { useT } from '@/hooks/use-t';
import { svgPoints } from '@/lib/pdf/drawing';
import { cn } from '@/lib/utils';
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
export function AnnotationLayer({ page, threads, pending, tool, selectedThreadId, onPlacePin, onStroke, onSelect }: AnnotationLayerProps) {
  const { t } = useT();
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
        const badge = cn(
          'pointer-events-auto absolute flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-xs font-semibold shadow-md transition-transform',
          isResolved ? 'border bg-muted text-foreground' : 'bg-annotation-3 text-background',
          isSelected && 'scale-125 ring-2 ring-ring ring-offset-2',
        );
        const select = (event: { stopPropagation: () => void }) => {
          event.stopPropagation();
          onSelect(thread.id);
        };
        if (thread.anchor.type === 'text') {
          const first = thread.anchor.rects[0];
          return (
            <div key={thread.id}>
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
        return (
          <div key={thread.id}>
            {thread.anchor.drawing && <Strokes strokes={thread.anchor.drawing.strokes} faded={isResolved} />}
            <button
              type="button"
              aria-label={t('Comentário {number}', { number })}
              style={{ left: `${thread.anchor.point.x * 100}%`, top: `${thread.anchor.point.y * 100}%` }}
              className={badge}
              onPointerDown={(event) => event.stopPropagation()}
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
