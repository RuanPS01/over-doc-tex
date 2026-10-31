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
    let timer: ReturnType<typeof setTimeout> | undefined;
    const handleChange = () => {
      clearTimeout(timer);
      timer = setTimeout(read, 250);
    };
    document.addEventListener('selectionchange', handleChange);
    document.addEventListener('pointerup', handleChange);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('selectionchange', handleChange);
      document.removeEventListener('pointerup', handleChange);
    };
  }, [containerRef, enabled]);

  const clear = () => {
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  };
  return [selection, clear];
}
