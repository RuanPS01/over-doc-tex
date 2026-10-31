import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { loadPdfjs } from '@/lib/pdf/pdfjs';

interface PdfPageProps {
  doc: PDFDocumentProxy;
  pageNumber: number;
  cssWidth: number;
  /** Altura sobre largura da página. */
  aspect: number;
  overlay?: ReactNode;
}

/** Uma página: desenhada no canvas quando chega perto da área visível. */
function PdfPage({ doc, pageNumber, cssWidth, aspect, overlay }: PdfPageProps) {
  const holderRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isNear, setIsNear] = useState(pageNumber <= 2);

  useEffect(() => {
    const holder = holderRef.current;
    if (!holder || isNear) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setIsNear(true);
      },
      { rootMargin: '800px 0px' },
    );
    observer.observe(holder);
    return () => observer.disconnect();
  }, [isNear]);

  useEffect(() => {
    if (!isNear || cssWidth <= 0) return;
    let task: RenderTask | null = null;
    let cancelled = false;
    void doc
      .getPage(pageNumber)
      .then((page) => {
        const canvas = canvasRef.current;
        if (cancelled || !canvas) return;
        const pixelRatio = window.devicePixelRatio || 1;
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: (cssWidth / base.width) * pixelRatio });
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        task = page.render({ canvas, viewport });
        return task.promise;
      })
      // Cancelamento por troca de zoom ou de PDF não é erro.
      .catch(() => undefined);
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, pageNumber, cssWidth, isNear]);

  return (
    <div
      ref={holderRef}
      role="img"
      aria-label={`Página ${pageNumber}`}
      data-pdf-page={pageNumber}
      className="relative shrink-0 bg-card shadow-md"
      style={{ width: cssWidth, height: cssWidth * aspect }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {overlay}
    </div>
  );
}

interface PdfPagesProps {
  data: Uint8Array;
  /** Largura útil do painel, em px. */
  availableWidth: number;
  /** Porcentagem: 100 ocupa a largura do painel (até 820 px). */
  zoom: number;
  onError: (message: string) => void;
  /** Camada sobre cada página (marcadores da revisão), em coordenadas da página. */
  renderOverlay?: (pageNumber: number) => ReactNode;
}

/** Páginas do PDF compilado, desenhadas pelo pdf.js. */
export function PdfPages({ data, availableWidth, zoom, onError, renderOverlay }: PdfPagesProps) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [aspects, setAspects] = useState<number[]>([]);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    let cancelled = false;
    let task: PDFDocumentLoadingTask | null = null;
    void loadPdfjs()
      .then(async (pdfjs) => {
        // O pdf.js transfere o buffer para o worker; a cópia preserva o PDF guardado no estado.
        task = pdfjs.getDocument({ data: data.slice() });
        const loaded = await task.promise;
        const pages = await Promise.all(
          Array.from({ length: loaded.numPages }, (_, index) => loaded.getPage(index + 1)),
        );
        if (cancelled) return;
        setAspects(
          pages.map((page) => {
            const viewport = page.getViewport({ scale: 1 });
            return viewport.height / viewport.width;
          }),
        );
        setDoc(loaded);
      })
      .catch((error: unknown) => {
        if (!cancelled) onErrorRef.current(`Não foi possível abrir o PDF: ${String(error)}`);
      });
    // Troca de PDF ou saída do painel: libera o documento e o worker do pdf.js.
    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [data]);

  // Passos de 8 px evitam redesenhar a cada pixel ao arrastar a divisória dos painéis.
  const cssWidth = Math.max(160, Math.round((Math.min(availableWidth, 820) * zoom) / 100 / 8) * 8);

  if (!doc) return null;
  return (
    <div className="mx-auto flex w-max flex-col items-center gap-4">
      {aspects.map((aspect, index) => (
        <PdfPage
          key={index}
          doc={doc}
          pageNumber={index + 1}
          cssWidth={cssWidth}
          aspect={aspect}
          overlay={renderOverlay?.(index + 1)}
        />
      ))}
    </div>
  );
}
