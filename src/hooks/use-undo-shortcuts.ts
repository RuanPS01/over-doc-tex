import { useEffect, useRef } from 'react';

/** Campos com desfazer próprio do navegador (ou do Monaco): o atalho da tela não age neles. */
function isTextTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || Boolean(target.closest('input, textarea, select, [contenteditable="true"], .monaco-editor'));
}

/**
 * Ctrl+Z desfaz; Ctrl+Shift+Z e Ctrl+Y refazem (Cmd no Mac). Só fora de
 * campos de texto, que já desfazem o que foi digitado.
 */
export function useUndoShortcuts({ enabled, onUndo, onRedo }: { enabled: boolean; onUndo: () => void; onRedo: () => void }) {
  // As funções mudam a cada render; o ouvinte lê a mais recente sem ser trocado.
  const handlers = useRef({ onUndo, onRedo });
  handlers.current = { onUndo, onRedo };

  useEffect(() => {
    if (!enabled) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || !(event.ctrlKey || event.metaKey) || isTextTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        handlers.current.onUndo();
      } else if ((key === 'z' && event.shiftKey) || (key === 'y' && !event.shiftKey)) {
        event.preventDefault();
        handlers.current.onRedo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled]);
}
