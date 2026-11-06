import { useCallback, useMemo, useRef, useState } from 'react';
import { UndoHistory, type UndoEntry } from '@/lib/undo-history';

/**
 * Histórico de desfazer e refazer de uma tela (`UndoHistory` com estado do
 * React). Uma operação por vez: Ctrl+Z repetido enquanto a anterior grava é
 * ignorado, para as gravações não se cruzarem. O erro de desfazer ou refazer
 * volta para quem chamou mostrar.
 */
export function useUndoStack(limit = 50) {
  const history = useRef(new UndoHistory(limit));
  const busy = useRef(false);
  const [version, setVersion] = useState(0);
  const [isBusy, setIsBusy] = useState(false);
  const refresh = useCallback(() => setVersion((current) => current + 1), []);

  const push = useCallback(
    (entry: UndoEntry) => {
      history.current.push(entry);
      refresh();
    },
    [refresh],
  );

  const run = useCallback(
    async (direction: 'undo' | 'redo') => {
      if (busy.current) return false;
      busy.current = true;
      setIsBusy(true);
      try {
        return await history.current[direction]();
      } finally {
        busy.current = false;
        setIsBusy(false);
        refresh();
      }
    },
    [refresh],
  );

  const undo = useCallback(() => run('undo'), [run]);
  const redo = useCallback(() => run('redo'), [run]);
  const clear = useCallback(() => {
    history.current.clear();
    refresh();
  }, [refresh]);

  return useMemo(
    () => ({
      push,
      undo,
      redo,
      clear,
      isBusy,
      canUndo: history.current.canUndo,
      canRedo: history.current.canRedo,
      undoLabel: history.current.nextUndo?.label ?? null,
      redoLabel: history.current.nextRedo?.label ?? null,
    }),
    // `version` muda a cada alteração das pilhas (que ficam numa ref).
    [push, undo, redo, clear, isBusy, version],
  );
}
