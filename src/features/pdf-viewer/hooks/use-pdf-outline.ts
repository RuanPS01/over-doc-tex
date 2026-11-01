import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useStoredToggle } from '@/hooks/use-stored-toggle';
import { activeOutlineId, flattenOutline, loadPdfOutline, type PdfOutlineItem, type PdfOutlinePosition } from '@/lib/pdf/outline';

/** Abaixo desta largura do visualizador, o índice abre por cima do PDF em vez de ao lado. */
const SIDE_BY_SIDE_MIN_WIDTH = 520;

/**
 * Linha de leitura: a seção atual é a que começa acima deste ponto, perto do
 * topo da área visível (como no leitor do Chrome). Fica abaixo da margem de
 * rolagem, para a seção clicada continuar sendo a atual quando a rolagem para.
 */
const READING_LINE_PX = 32;

/** Margem acima do título ao rolar até uma seção. */
const SCROLL_MARGIN_PX = 12;

/** Página e altura (fração) na linha de leitura da área rolável. */
function readingPosition(area: HTMLElement): PdfOutlinePosition | null {
  const line = area.scrollTop + Math.min(area.clientHeight * 0.25, READING_LINE_PX);
  const pages = area.querySelectorAll<HTMLElement>('[data-pdf-page]');
  let last: PdfOutlinePosition | null = null;
  for (const element of pages) {
    const page = Number(element.dataset.pdfPage);
    const top = element.offsetTop;
    const height = element.offsetHeight || 1;
    // No vão entre duas páginas, a leitura já está no topo da seguinte.
    if (line < top) return { page, y: 0 };
    if (line <= top + height) return { page, y: (line - top) / height };
    last = { page, y: 1 };
  }
  return last;
}

interface UsePdfOutlineOptions {
  /** Documento aberto pelo pdf.js (nulo enquanto carrega). */
  doc: PDFDocumentProxy | null;
  /** Área que rola as páginas (cada página tem data-pdf-page). */
  scrollRef: RefObject<HTMLElement>;
  /** Caixa que contém índice e páginas: a largura dela decide ao lado ou por cima. */
  frameRef: RefObject<HTMLElement>;
  /** Onde a escolha de abrir ou fechar fica lembrada neste navegador. */
  storageKey: string;
  /** Aberto antes de a pessoa escolher (a revisão abre; o editor, com a tela dividida, não). */
  defaultOpen: boolean;
  /** Muda quando o tamanho das páginas muda (zoom, largura): relê a seção atual. */
  layoutKey: unknown;
}

/**
 * Índice do PDF no visualizador: carrega os marcadores do documento, acompanha
 * a rolagem para saber a seção atual e rola até a seção escolhida. Num
 * visualizador estreito, o índice abre por cima do PDF, fecha ao escolher uma
 * seção e não muda a escolha lembrada para o modo lado a lado.
 */
export function usePdfOutline({ doc, scrollRef, frameRef, storageKey, defaultOpen, layoutKey }: UsePdfOutlineOptions) {
  const [items, setItems] = useState<PdfOutlineItem[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [frameWidth, setFrameWidth] = useState(0);
  const [stored, store] = useStoredToggle(storageKey);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  // Seção clicada: continua marcada até a rolagem suave chegar ao destino (as do caminho não piscam).
  // O tempo da rolagem varia (páginas sendo desenhadas no caminho), então vale a chegada, não um prazo.
  const chosen = useRef<{ id: string; target: number; expires: number } | null>(null);

  useEffect(() => {
    setItems(null);
    if (!doc) return;
    let cancelled = false;
    loadPdfOutline(doc)
      .then((outline) => !cancelled && setItems(outline))
      .catch(() => !cancelled && setItems([]));
    return () => {
      cancelled = true;
    };
  }, [doc]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new ResizeObserver(([entry]) => entry && setFrameWidth(entry.contentRect.width));
    observer.observe(frame);
    return () => observer.disconnect();
  }, [frameRef]);

  const { entries, parents } = useMemo(() => flattenOutline(items ?? []), [items]);
  const available = entries.length > 0;
  const overlay = frameWidth > 0 && frameWidth < SIDE_BY_SIDE_MIN_WIDTH;
  const open = available && (overlay ? overlayOpen : (stored ?? defaultOpen));

  const setOpen = useCallback((next: boolean) => (overlay ? setOverlayOpen(next) : store(next)), [overlay, store]);

  useEffect(() => {
    const area = scrollRef.current;
    if (!area || entries.length === 0) {
      setActiveId(null);
      return;
    }
    let frame = 0;
    const update = () => {
      frame = 0;
      const pending = chosen.current;
      if (pending) {
        setActiveId(pending.id);
        // Chegou (ou não dá para rolar mais, ou demorou demais): libera, e a próxima rolagem volta a ler a tela.
        const settled = Math.abs(area.scrollTop - pending.target) <= 2 || performance.now() > pending.expires;
        if (settled) chosen.current = null;
        return;
      }
      const position = readingPosition(area);
      setActiveId(position ? activeOutlineId(entries, position) : null);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    // Rolagem pela própria pessoa no meio do caminho: a tela volta a mandar na seção atual.
    const release = () => {
      chosen.current = null;
    };
    update();
    area.addEventListener('scroll', schedule, { passive: true });
    area.addEventListener('wheel', release, { passive: true });
    area.addEventListener('touchstart', release, { passive: true });
    area.addEventListener('keydown', release);
    window.addEventListener('resize', schedule);
    return () => {
      area.removeEventListener('scroll', schedule);
      area.removeEventListener('wheel', release);
      area.removeEventListener('touchstart', release);
      area.removeEventListener('keydown', release);
      window.removeEventListener('resize', schedule);
      cancelAnimationFrame(frame);
    };
  }, [entries, scrollRef, layoutKey]);

  const goTo = useCallback(
    (item: PdfOutlineItem) => {
      const area = scrollRef.current;
      const page = item.page !== null ? area?.querySelector<HTMLElement>(`[data-pdf-page="${item.page}"]`) : null;
      if (!area || !page) return;
      const maxTop = Math.max(0, area.scrollHeight - area.clientHeight);
      const target = Math.round(Math.min(maxTop, Math.max(0, page.offsetTop + (item.y ?? 0) * page.offsetHeight - SCROLL_MARGIN_PX)));
      chosen.current = { id: item.id, target, expires: performance.now() + 4000 };
      setActiveId(item.id);
      area.scrollTo({ top: target, behavior: reduceMotion ? 'auto' : 'smooth' });
      if (overlay) setOverlayOpen(false);
    },
    [scrollRef, overlay, reduceMotion],
  );

  return { items: items ?? [], available, open, setOpen, overlay, activeId, parents, goTo };
}
