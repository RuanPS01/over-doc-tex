import { Download, FileText, Loader2, ZoomIn, ZoomOut } from 'lucide-react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useEffect, useRef, useState, type MouseEvent, type ReactNode, type RefObject } from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useT } from '@/hooks/use-t';
import { downloadBytes } from '@/lib/download';
import { cn } from '@/lib/utils';
import { usePdfOutline } from '../hooks/use-pdf-outline';
import { PdfOutlineToggle } from './pdf-outline';
import { PdfOutlineFrame } from './pdf-outline-frame';
import { PdfPages } from './pdf-pages';

const ZOOM_STEPS = [50, 75, 100, 125, 150, 200] as const;

/** Outra forma de baixar o documento, ao lado do PDF original (ex.: com as anotações da revisão). */
export interface PdfDownloadOption {
  id: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  onSelect: () => void;
}

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
  /** Onde a escolha de abrir o índice fica lembrada (ex.: "review", "version"). */
  outlineKey?: string;
  /** Índice aberto antes de a pessoa escolher (a revisão abre, para guiar a leitura). */
  outlineDefaultOpen?: boolean;
  /** Clique na área do PDF (a revisão tira a seleção do comentário). */
  onAreaClick?: (event: MouseEvent<HTMLDivElement>) => void;
  /** Outras formas de baixar: o botão de download vira um menu com "PDF original" e elas. */
  downloadOptions?: readonly PdfDownloadOption[];
  /** Um desses downloads está sendo gerado (o botão gira e fica desligado). */
  isPreparingDownload?: boolean;
}

/**
 * PDF pronto (de uma versão ou da revisão) com zoom, download e o índice do
 * documento (marcadores do hyperref). O zoom acima de 100% rola só dentro da
 * área do PDF, nunca no body.
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
  outlineKey = 'document',
  outlineDefaultOpen = false,
  onAreaClick,
  downloadOptions,
  isPreparingDownload = false,
}: PdfDocumentViewProps) {
  const { t } = useT();
  const [zoomIndex, setZoomIndex] = useState(2);
  const zoom = ZOOM_STEPS[zoomIndex] ?? 100;
  const [viewerError, setViewerError] = useState<string | null>(null);
  const ownRef = useRef<HTMLDivElement>(null);
  const areaRef = scrollRef ?? ownRef;
  const [availableWidth, setAvailableWidth] = useState(0);
  const frameRef = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const outline = usePdfOutline({
    doc,
    scrollRef: areaRef,
    frameRef,
    storageKey: `overdoctex.pdf-outline.${outlineKey}`,
    defaultOpen: outlineDefaultOpen,
    layoutKey: `${zoom}:${availableWidth}`,
  });

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
        {outline.available && <PdfOutlineToggle open={outline.open} className="size-8" onToggle={() => outline.setOpen(!outline.open)} />}
        <div className="min-w-0 flex-1 truncate font-medium text-foreground">{title}</div>
        {actions}
        {downloadOptions && downloadOptions.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8" aria-label={t('Baixar PDF')} title={t('Baixar PDF')} disabled={!pdf || isPreparingDownload}>
                {isPreparingDownload ? <Loader2 className="animate-spin" /> : <Download />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" collisionPadding={8} className="w-72 max-w-[calc(100vw-1rem)]">
              <DropdownMenuItem className="items-start" onSelect={() => pdf && downloadBytes(pdf, fileName, 'application/pdf')}>
                <FileText className="mt-0.5" />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span>{t('PDF original')}</span>
                  <span className="text-xs text-muted-foreground">{t('Como a versão foi congelada, sem marcações nem comentários.')}</span>
                </span>
              </DropdownMenuItem>
              {downloadOptions.map((option) => (
                <DropdownMenuItem key={option.id} className="items-start" onSelect={option.onSelect}>
                  <span className="mt-0.5 flex [&_svg]:size-4">{option.icon ?? <Download />}</span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span>{option.label}</span>
                    {option.description && <span className="text-xs text-muted-foreground">{option.description}</span>}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
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
        )}
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
        <span className="hidden w-10 shrink-0 text-center tabular-nums sm:inline">{zoom}%</span>
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
      <PdfOutlineFrame outline={outline} frameRef={frameRef} widthKey={`overdoctex.pdf-outline-width.${outlineKey}`}>
        <div ref={areaRef} className="relative min-h-0 min-w-0 flex-1 overflow-auto p-3 sm:p-4" onClick={onAreaClick}>
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
              onDocument={setDoc}
            />
          ) : (
            <p className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {loadingLabel ?? t('Carregando o PDF')}
            </p>
          )}
        </div>
      </PdfOutlineFrame>
    </section>
  );
}
