import { useCallback, useEffect, useRef, useState } from 'react';
import { usePanelRef, type PanelSize } from 'react-resizable-panels';

function readWidth(key: string): number | null {
  try {
    const value = Number(localStorage.getItem(key));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function writeWidth(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Sem armazenamento: a largura vale só nesta aba.
  }
}

/** Tempo sem mudar de tamanho para a largura contar como escolhida. */
const SETTLE_MS = 300;

/**
 * Painel lateral recolhível de um grupo redimensionável (react-resizable-panels):
 * recolhe até a borda pelo botão ou arrastando, e reabre com a última largura
 * usada (lembrada neste navegador em `widthKey`), não com o mínimo. A largura
 * só conta depois de parar de mudar: num arraste que termina recolhendo, as
 * larguras do caminho (que descem até o mínimo) não substituem a anterior.
 */
export function useCollapsiblePanel(widthKey: string, defaultPx: number) {
  const panelRef = usePanelRef();
  const [collapsed, setCollapsed] = useState(false);
  const lastWidth = useRef<number>(readWidth(widthKey) ?? defaultPx);
  const settleTimer = useRef<number | null>(null);

  const cancelSettle = () => {
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    settleTimer.current = null;
  };
  useEffect(() => cancelSettle, []);

  const onResize = useCallback(
    (size: PanelSize) => {
      const isCollapsed = size.inPixels < 1;
      setCollapsed(isCollapsed);
      cancelSettle();
      if (isCollapsed) return;
      const width = Math.round(size.inPixels);
      settleTimer.current = window.setTimeout(() => {
        settleTimer.current = null;
        lastWidth.current = width;
        writeWidth(widthKey, width);
      }, SETTLE_MS);
    },
    [widthKey],
  );

  const expand = useCallback(() => {
    const panel = panelRef.current;
    // resize, e não expand: sem largura anterior conhecida, expand abriria no mínimo.
    if (panel?.isCollapsed()) panel.resize(lastWidth.current);
  }, [panelRef]);

  const collapse = useCallback(() => {
    const panel = panelRef.current;
    if (panel && !panel.isCollapsed()) panel.collapse();
  }, [panelRef]);

  return { panelRef, collapsed, onResize, expand, collapse };
}
