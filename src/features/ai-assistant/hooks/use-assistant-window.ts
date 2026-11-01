import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  assistantWindowSize,
  centeredPosition,
  clampWindowPosition,
  dockedPosition,
  DRAG_THRESHOLD_PX,
  grabOffset,
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
 * arrastada pelo cabeçalho (ou pela alça da encaixada, que só solta depois de
 * o ponteiro andar alguns pixels). A escolha fica lembrada neste navegador; a
 * janela solta volta para dentro da tela quando a janela do navegador encolhe.
 */
export function useAssistantWindow() {
  const [state, setStateRaw] = useState<AssistantWindowState>(readState);
  const [viewport, setViewport] = useState(viewportNow);
  const [isDragging, setIsDragging] = useState(false);

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

  // Arraste em andamento: os ouvintes ficam na janela do navegador, não no elemento clicado. Ao soltar
  // a janela encaixada, a alça sai da tela (vira a janela solta); com captura do ponteiro no elemento,
  // o pointerup se perdia e a janela seguia o mouse até um novo clique.
  const stopDrag = useRef<(() => void) | null>(null);
  useEffect(() => () => stopDrag.current?.(), []);

  /** Arrastar pelo cabeçalho (ou pela alça da encaixada); botões dentro dele continuam sendo só botões. */
  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const target = event.target as HTMLElement;
      // Menus abertos a partir do cabeçalho ficam em portal fora dele, mas o React repassa os eventos
      // pela árvore de componentes: só conta o que nasceu no próprio cabeçalho, fora de controles.
      if (event.button !== 0 || !event.currentTarget.contains(target) || target.closest('button, a, input, textarea, [role^="menuitem"]')) return;
      event.preventDefault();
      stopDrag.current?.();

      const pointerId = event.pointerId;
      const start = { x: event.clientX, y: event.clientY };
      const fromDocked = state.mode === 'docked';
      // Começa de onde a janela está na tela; sem ela, pela posição guardada.
      const rect = event.currentTarget.closest('[data-assistant-window]')?.getBoundingClientRect();
      const fallback = state.mode === 'floating' ? clampWindowPosition(state, size, viewportNow()) : dockedPosition(state.dock, size, viewportNow());
      const box = rect ? { left: rect.left, top: rect.top, width: rect.width } : { left: fallback.x, top: fallback.y, width: size.width };
      const offset = grabOffset(start, box, size, fromDocked);
      let moving = false;
      let last: AssistantWindowState | null = null;

      const finish = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        window.removeEventListener('blur', finish);
        stopDrag.current = null;
        if (!moving) return;
        setIsDragging(false);
        if (last) writeState(last);
      };
      const onMove = (move: PointerEvent) => {
        if (move.pointerId !== pointerId) return;
        // Botão já solto sem o pointerup chegar (soltou fora da janela do navegador): encerra.
        if (move.buttons === 0) return finish();
        if (!moving) {
          if (Math.hypot(move.clientX - start.x, move.clientY - start.y) < DRAG_THRESHOLD_PX) return;
          moving = true;
          setIsDragging(true);
        }
        last = { mode: 'floating', ...clampWindowPosition({ x: move.clientX - offset.x, y: move.clientY - offset.y }, size, viewportNow()) };
        setStateRaw(last);
      };
      const onUp = (up: PointerEvent) => {
        if (up.pointerId === pointerId) finish();
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
      window.addEventListener('blur', finish);
      stopDrag.current = finish;
    },
    [state, size],
  );

  const position = state.mode === 'floating' ? clampWindowPosition(state, size, viewport) : null;
  return {
    state,
    size,
    viewport,
    position,
    isDragging,
    dock,
    undock,
    dragHandleProps: { onPointerDown },
  };
}
