import { useCallback, useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type PointerEvent } from 'react';
import { DOCK_LEAVE_DELAY_MS, nextDockReveal, type DockReveal, type DockRevealEvent } from '../model/assistant-window';

/** Atributo da aba: foco nela (ao ocultar ou pelo Tab) não conta como interação com a janela. */
export const DOCK_TAB_ATTRIBUTE = 'data-dock-tab';

const isOnTab = (target: EventTarget | null) => target instanceof Element && target.closest(`[${DOCK_TAB_ATTRIBUTE}]`) !== null;

/**
 * Aba do assistente encaixado: o mouse em cima revela a janela; ao sair sem
 * interagir, ela encolhe depois de um instante; clique, foco ou digitação
 * dentro fixam a janela até "Ocultar" ou Esc. Começa fixada quando o
 * assistente acaba de ser ligado (`startPinned`).
 */
export function useDockReveal(startPinned: boolean) {
  const [reveal, setReveal] = useState<DockReveal>(startPinned ? 'pinned' : 'tab');
  const leaveTimer = useRef<number | null>(null);

  const cancelLeave = () => {
    if (leaveTimer.current !== null) window.clearTimeout(leaveTimer.current);
    leaveTimer.current = null;
  };

  const send = useCallback((event: DockRevealEvent) => {
    cancelLeave();
    setReveal((current) => nextDockReveal(current, event));
  }, []);

  useEffect(() => cancelLeave, []);

  const containerProps = {
    onPointerEnter: (event: PointerEvent<HTMLElement>) => {
      // Toque não tem "passar por cima": no toque, só o clique na aba abre.
      if (event.pointerType === 'mouse') send('enter');
    },
    onPointerLeave: (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType !== 'mouse') return;
      cancelLeave();
      leaveTimer.current = window.setTimeout(() => {
        leaveTimer.current = null;
        setReveal((current) => nextDockReveal(current, 'leave'));
      }, DOCK_LEAVE_DELAY_MS);
    },
    onPointerDownCapture: (event: PointerEvent<HTMLElement>) => {
      if (!isOnTab(event.target)) send('interact');
    },
    onFocusCapture: (event: FocusEvent<HTMLElement>) => {
      if (!isOnTab(event.target)) send('interact');
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      // Esc de um menu aberto a partir da janela (em portal) só fecha o menu.
      if (event.key !== 'Escape' || event.defaultPrevented || !event.currentTarget.contains(event.target as Node)) return;
      if ((event.target as Element).closest('[role="menu"], [role="listbox"]')) return;
      send('hide');
    },
  };

  return { reveal, revealed: reveal !== 'tab', send, containerProps };
}
