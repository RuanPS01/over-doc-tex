import type { MouseEvent } from 'react';
import { cn } from '@/lib/utils';
import type { ThreadSummary } from '../model/review';

export interface PendingPin {
  page: number;
  point: { x: number; y: number };
}

interface PinLayerProps {
  page: number;
  /** Threads desta página, com o número exibido. */
  pins: Array<{ thread: ThreadSummary; number: number }>;
  pending: PendingPin | null;
  isPlacing: boolean;
  selectedThreadId: string | null;
  onPlace: (pin: PendingPin) => void;
  onSelect: (threadId: string) => void;
}

const round = (value: number) => Math.round(Math.min(1, Math.max(0, value)) * 10_000) / 10_000;

/**
 * Marcadores sobre a página, em coordenadas de 0 a 1: acompanham o zoom sem
 * recalcular nada. No modo "Comentar", um clique na página posiciona o pin.
 */
export function PinLayer({ page, pins, pending, isPlacing, selectedThreadId, onPlace, onSelect }: PinLayerProps) {
  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    onPlace({ page, point: { x: round((event.clientX - box.left) / box.width), y: round((event.clientY - box.top) / box.height) } });
  };

  return (
    <div
      className={cn('absolute inset-0', isPlacing ? 'cursor-crosshair' : 'pointer-events-none')}
      onClick={isPlacing ? handleClick : undefined}
    >
      {pins.map(({ thread, number }) => {
        if (thread.anchor.type !== 'pin') return null;
        const isResolved = thread.status === 'resolved';
        return (
          <button
            key={thread.id}
            type="button"
            aria-label={`Comentário ${number}`}
            style={{ left: `${thread.anchor.point.x * 100}%`, top: `${thread.anchor.point.y * 100}%` }}
            onClick={(event) => {
              event.stopPropagation();
              onSelect(thread.id);
            }}
            className={cn(
              'pointer-events-auto absolute flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-xs font-semibold shadow-md transition-transform',
              isResolved ? 'border bg-muted text-foreground' : 'bg-annotation-3 text-background',
              thread.id === selectedThreadId && 'scale-125 ring-2 ring-ring ring-offset-2',
            )}
          >
            {number}
          </button>
        );
      })}
      {pending?.page === page && (
        <span
          aria-hidden
          style={{ left: `${pending.point.x * 100}%`, top: `${pending.point.y * 100}%` }}
          className="absolute size-7 -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full border-2 border-annotation-3 bg-annotation-3/30"
        />
      )}
    </div>
  );
}
