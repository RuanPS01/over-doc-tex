import { useEffect, useState, type RefObject } from 'react';

export interface PageSelection {
  page: number;
  text: string;
  /** Retângulos da seleção e da página, em pixels da janela. */
  rects: DOMRect[];
  pageBox: DOMRect;
}

/**
 * Seleção de texto dentro da camada de texto de UMA página do PDF. Seleção
 * que atravessa páginas ou sai do PDF é ignorada (a âncora é por página).
 */
export function useTextSelection(containerRef: RefObject<HTMLElement>, enabled: boolean): [PageSelection | null, () => void] {
  const [selection, setSelection] = useState<PageSelection | null>(null);

  useEffect(() => {
    if (!enabled) {
      setSelection(null);
      return;
    }
    const read = () => {
      const current = window.getSelection();
      const container = containerRef.current;
      if (!current || current.isCollapsed || current.rangeCount === 0 || !container) {
        setSelection(null);
        return;
      }
      const range = current.getRangeAt(0);
      const pageOf = (node: Node) => (node instanceof Element ? node : node.parentElement)?.closest<HTMLElement>('[data-pdf-page]') ?? null;
      const startPage = pageOf(range.startContainer);
      const endPage = pageOf(range.endContainer);
      if (!startPage || startPage !== endPage || !container.contains(startPage)) {
        setSelection(null);
        return;
      }
      const text = current.toString().trim();
      if (!text) {
        setSelection(null);
        return;
      }
      setSelection({
        page: Number(startPage.dataset.pdfPage),
        text,
        rects: [...range.getClientRects()],
        pageBox: startPage.getBoundingClientRect(),
      });
    };
    // Lê ao soltar (mouse ou toque) e quando a seleção muda pelo teclado ou pelas alças do celular.
    // Com o botão ainda apertado não lê: uma pausa no meio do arraste não vira seleção pronta (na
    // remarcação por trecho, ela já seria gravada).
    let timer: ReturnType<typeof setTimeout> | undefined;
    let isPressed = false;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => !isPressed && read(), 250);
    };
    const handleDown = () => {
      isPressed = true;
    };
    const handleUp = () => {
      isPressed = false;
      schedule();
    };
    document.addEventListener('selectionchange', schedule);
    document.addEventListener('pointerdown', handleDown);
    document.addEventListener('pointerup', handleUp);
    document.addEventListener('pointercancel', handleUp);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('selectionchange', schedule);
      document.removeEventListener('pointerdown', handleDown);
      document.removeEventListener('pointerup', handleUp);
      document.removeEventListener('pointercancel', handleUp);
    };
  }, [containerRef, enabled]);

  const clear = () => {
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  };
  return [selection, clear];
}
