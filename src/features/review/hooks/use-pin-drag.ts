import { useRef, useState, type PointerEvent, type RefObject } from 'react';
import type { NormalizedPoint } from '@shared/firestore/types';

/** Pin sendo arrastado: a thread e onde o pin está agora (de 0 a 1 na página). */
export interface PinDrag {
  threadId: string;
  point: NormalizedPoint;
}

/** Distância (em pixels) que separa um clique de um arraste: um clique no pin continua escolhendo a thread. */
const DRAG_THRESHOLD = 4;

const clamp = (value: number) => Math.min(1, Math.max(0, value));

/**
 * Arrastar o pin de uma thread para outro lugar da mesma página. O pin segue o
 * ponteiro a partir do ponto em que foi pego (não pula para o centro do cursor);
 * ao soltar, `onMove` grava, e a posição arrastada continua na tela até a
 * gravação terminar. O clique que encerra um arraste não escolhe a thread.
 */
export function usePinDrag(rootRef: RefObject<HTMLElement>, onMove: (threadId: string, point: NormalizedPoint) => Promise<unknown>) {
  const [drag, setDrag] = useState<PinDrag | null>(null);
  const gesture = useRef<{ threadId: string; startX: number; startY: number; offsetX: number; offsetY: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  const pointAt = (clientX: number, clientY: number): NormalizedPoint => {
    const box = rootRef.current?.getBoundingClientRect();
    if (!box || box.width === 0 || box.height === 0) return { x: 0, y: 0 };
    return { x: (clientX - box.left) / box.width, y: (clientY - box.top) / box.height };
  };

  const targetOf = (event: PointerEvent<HTMLElement>): NormalizedPoint => {
    const at = pointAt(event.clientX, event.clientY);
    const offsetX = gesture.current?.offsetX ?? 0;
    const offsetY = gesture.current?.offsetY ?? 0;
    return { x: clamp(at.x - offsetX), y: clamp(at.y - offsetY) };
  };

  /** Eventos para o botão do pin de uma thread que a pessoa pode mover. */
  const bind = (threadId: string, pin: NormalizedPoint) => ({
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      // O pin nunca passa o clique para a camada (que marcaria um ponto novo ou começaria um traço).
      event.stopPropagation();
      if (event.button !== 0) return;
      const at = pointAt(event.clientX, event.clientY);
      gesture.current = { threadId, startX: event.clientX, startY: event.clientY, offsetX: at.x - pin.x, offsetY: at.y - pin.y, moved: false };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      const current = gesture.current;
      if (!current || current.threadId !== threadId) return;
      if (!current.moved && Math.hypot(event.clientX - current.startX, event.clientY - current.startY) < DRAG_THRESHOLD) return;
      current.moved = true;
      setDrag({ threadId, point: targetOf(event) });
    },
    onPointerUp: (event: PointerEvent<HTMLElement>) => {
      const current = gesture.current;
      if (!current || current.threadId !== threadId) return;
      const point = targetOf(event);
      gesture.current = null;
      if (!current.moved) return;
      suppressClick.current = true;
      setDrag({ threadId, point });
      void onMove(threadId, point).finally(() => setDrag((now) => (now?.threadId === threadId ? null : now)));
    },
    onPointerCancel: () => {
      gesture.current = null;
      setDrag(null);
    },
  });

  /** Verdadeiro (uma vez) para o clique que vem logo depois de soltar um arraste. */
  const consumeClick = () => {
    if (!suppressClick.current) return false;
    suppressClick.current = false;
    return true;
  };

  return { drag, bind, consumeClick };
}
