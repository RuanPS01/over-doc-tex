import { Download, Loader2, ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Button } from '@/components/ui/button';
import { useT } from '@/hooks/use-t';
import { downloadBytes } from '@/lib/download';
import { cn } from '@/lib/utils';
import { PdfPages } from './pdf-pages';

const ZOOM_STEPS = [50, 75, 100, 125, 150, 200] as const;

interface PdfDocumentViewProps {
  /** Nulo enquanto carrega. */
  pdf: Uint8Array | null;
  fileName: string;
  /** Texto à esquerda da barra (ex.: "Versão 1.2"). */
  title: ReactNode;
  error?: string | null;
  loadingLabel?: string;
  renderOverlay?: (pageNumber: number) => ReactNode;
  /** Ações extras na barra, antes do download. */
  actions?: ReactNode;
  scrollRef?: RefObject<HTMLDivElement>;
  /** Ex.: espaço para o botão de fechar do diálogo. */
  toolbarClassName?: string;
  textLayer?: boolean;
  onPageSizes?: (sizes: Array<{ width: number; height: number }>) => void;
}

/**
 * PDF pronto (de uma versão ou da revisão) com zoom e download. O zoom acima
 * de 100% rola só dentro da área do PDF, nunca no body.
 */
export function PdfDocumentView({
  pdf,
  fileName,
  title,
  error,
  loadingLabel,
  renderOverlay,
  actions,
  scrollRef,
  toolbarClassName,
  textLayer,
  onPageSizes,
}: PdfDocumentViewProps) {
  const { t } = useT();
  const [zoomIndex, setZoomIndex] = useState(2);
  const zoom = ZOOM_STEPS[zoomIndex] ?? 100;
  const [viewerError, setViewerError] = useState<string | null>(null);
  const ownRef = useRef<HTMLDivElement>(null);
  const areaRef = scrollRef ?? ownRef;
  const [availableWidth, setAvailableWidth] = useState(0);

  useEffect(() => {
    const element = areaRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setAvailableWidth(Math.max(0, entry.contentRect.width - 8));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [areaRef]);

  useEffect(() => setViewerError(null), [pdf]);
  const shownError = error ?? viewerError;

  return (
    <section aria-label="PDF" className="flex h-full min-h-0 min-w-0 flex-col bg-pdf-canvas">
      <div className={cn('flex h-10 shrink-0 items-center gap-1 border-b bg-background px-2 text-xs text-muted-foreground', toolbarClassName)}>
        <div className="min-w-0 flex-1 truncate font-medium text-foreground">{title}</div>
        {actions}
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label={t('Baixar PDF')}
          disabled={!pdf}
          onClick={() => pdf && downloadBytes(pdf, fileName, 'application/pdf')}
        >
          <Download />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label={t('Diminuir zoom')}
          disabled={zoomIndex === 0}
          onClick={() => setZoomIndex((index) => Math.max(0, index - 1))}
        >
          <ZoomOut />
        </Button>
        <span className="hidden w-10 shrink-0 text-center tabular-nums xs:inline">{zoom}%</span>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label={t('Aumentar zoom')}
          disabled={zoomIndex === ZOOM_STEPS.length - 1}
          onClick={() => setZoomIndex((index) => Math.min(ZOOM_STEPS.length - 1, index + 1))}
        >
          <ZoomIn />
        </Button>
      </div>
      <div ref={areaRef} className="relative min-h-0 flex-1 overflow-auto p-3 sm:p-4">
        {shownError ? (
          <p className="m-auto max-w-sm p-6 text-center text-sm text-destructive">{shownError}</p>
        ) : pdf ? (
          <PdfPages
            data={pdf}
            availableWidth={availableWidth}
            zoom={zoom}
            onError={setViewerError}
            renderOverlay={renderOverlay}
            textLayer={textLayer}
            onPageSizes={onPageSizes}
          />
        ) : (
          <p className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {loadingLabel ?? t('Carregando o PDF')}
          </p>
        )}
      </div>
    </section>
  );
}
