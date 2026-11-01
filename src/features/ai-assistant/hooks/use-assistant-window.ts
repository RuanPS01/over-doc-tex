import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  assistantWindowSize,
  centeredPosition,
  clampWindowPosition,
  dockedPosition,
  parseAssistantWindow,
  type AssistantWindowState,
  type DockPosition,
} from '../model/assistant-window';

const STORAGE_KEY = 'overdoctex.ai-window';

function readState(): AssistantWindowState {
  try {
    return parseAssistantWindow(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'));
  } catch {
    return parseAssistantWindow(null);
  }
}

function writeState(state: AssistantWindowState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Armazenamento indisponível: vale só nesta aba.
  }
}

const viewportNow = () => ({ width: window.innerWidth, height: window.innerHeight });

/**
 * Posição da janela do assistente no desktop: encaixada no rodapé ou solta e
 * arrastada pelo cabeçalho. A escolha fica lembrada neste navegador; a janela
 * solta volta para dentro da tela quando a janela do navegador encolhe.
 */
export function useAssistantWindow() {
  const [state, setStateRaw] = useState<AssistantWindowState>(readState);
  const [viewport, setViewport] = useState(viewportNow);
  const [isDragging, setIsDragging] = useState(false);
  const drag = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);

  useEffect(() => {
    const onResize = () => setViewport(viewportNow());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const size = assistantWindowSize(viewport);

  const setState = useCallback((next: AssistantWindowState) => {
    setStateRaw(next);
    writeState(next);
  }, []);

  const dock = useCallback((position: DockPosition) => setState({ mode: 'docked', dock: position }), [setState]);
  const undock = useCallback(() => setState({ mode: 'floating', ...centeredPosition(size, viewportNow()) }), [setState, size]);

  /** Arrastar pelo cabeçalho; botões dentro dele continuam sendo só botões. */
  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const target = event.target as HTMLElement;
      // Menus abertos a partir do cabeçalho ficam em portal fora dele, mas o React repassa os eventos
      // pela árvore de componentes: só conta o que nasceu no próprio cabeçalho, fora de controles.
      if (event.button !== 0 || !event.currentTarget.contains(target) || target.closest('button, a, input, textarea, [role^="menuitem"]')) return;
      const current = viewportNow();
      const origin = state.mode === 'floating' ? clampWindowPosition(state, size, current) : dockedPosition(state.dock, size, current);
      drag.current = { pointerId: event.pointerId, offsetX: event.clientX - origin.x, offsetY: event.clientY - origin.y };
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
      setIsDragging(true);
      setStateRaw({ mode: 'floating', ...origin });
    },
    [state, size],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const active = drag.current;
      if (!active || active.pointerId !== event.pointerId) return;
      setStateRaw({ mode: 'floating', ...clampWindowPosition({ x: event.clientX - active.offsetX, y: event.clientY - active.offsetY }, size, viewportNow()) });
    },
    [size],
  );

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!drag.current || drag.current.pointerId !== event.pointerId) return;
      drag.current = null;
      setIsDragging(false);
      setStateRaw((current) => {
        writeState(current);
        return current;
      });
    },
    [],
  );

  const position = state.mode === 'floating' ? clampWindowPosition(state, size, viewport) : null;
  return {
    state,
    size,
    position,
    isDragging,
    dock,
    undock,
    dragHandleProps: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
  };
}
