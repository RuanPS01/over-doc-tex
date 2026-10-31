import { AlertTriangle, ChevronDown, CircleX, Download, FileText, Loader2, Play, ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { downloadBytes } from '@/lib/download';
import type { TexIssue } from '@/lib/latex/prepare';
import { cn } from '@/lib/utils';
import { PdfPages } from './pdf-pages';

const ZOOM_STEPS = [50, 75, 100, 125, 150, 200] as const;

export interface PdfPreviewPanelProps {
  pdf: Uint8Array | null;
  /** Nome exibido e usado no download, ex.: "main.pdf". */
  fileName: string;
  isCompiling: boolean;
  /** Etapa em andamento, ex.: "Compilando". */
  statusLabel: string | null;
  /** Resumo da última compilação, ex.: "Compilado em 2,4 s". */
  summary: string | null;
  failed: boolean;
  issues: TexIssue[];
  onCompile: () => void;
  onIssueSelect: (issue: TexIssue) => void;
}

const ISSUE_ICONS = { error: CircleX, 'missing-package': CircleX, warning: AlertTriangle } as const;

/**
 * Visualizador do PDF compilado (pdf.js). A largura das páginas acompanha o
 * painel e o zoom acima de 100% rola apenas DENTRO dele, nunca no body.
 */
export function PdfPreviewPanel({
  pdf,
  fileName,
  isCompiling,
  statusLabel,
  summary,
  failed,
  issues,
  onCompile,
  onIssueSelect,
}: PdfPreviewPanelProps) {
  const [zoomIndex, setZoomIndex] = useState(2);
  const zoom = ZOOM_STEPS[zoomIndex] ?? 100;
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [issuesOpen, setIssuesOpen] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState(0);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      // Desconta o respiro lateral da área de rolagem.
      if (entry) setAvailableWidth(Math.max(0, entry.contentRect.width - 8));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => setViewerError(null), [pdf]);
  // Erros novos abrem a lista de novo.
  useEffect(() => setIssuesOpen(true), [issues]);

  const errorCount = issues.filter((issue) => issue.kind !== 'warning').length;
  const warningCount = issues.length - errorCount;

  return (
    <section aria-label="Pré-visualização do PDF" className="flex h-full min-w-0 flex-col bg-pdf-canvas">
      <div className="flex h-9 shrink-0 items-center gap-1 border-b bg-background px-2 text-xs text-muted-foreground">
        <FileText className="size-3.5 shrink-0" />
        <span className="min-w-0 truncate">{fileName}</span>
        <span
          role="status"
          className={cn('min-w-0 flex-1 truncate', failed && !isCompiling && 'font-medium text-destructive')}
        >
          {isCompiling ? statusLabel : summary}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label="Baixar PDF"
          disabled={!pdf}
          onClick={() => pdf && downloadBytes(pdf, fileName, 'application/pdf')}
        >
          <Download />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label="Diminuir zoom"
          disabled={zoomIndex === 0}
          onClick={() => setZoomIndex((index) => Math.max(0, index - 1))}
        >
          <ZoomOut />
        </Button>
        <span className="w-10 shrink-0 text-center tabular-nums">{zoom}%</span>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label="Aumentar zoom"
          disabled={zoomIndex === ZOOM_STEPS.length - 1}
          onClick={() => setZoomIndex((index) => Math.min(ZOOM_STEPS.length - 1, index + 1))}
        >
          <ZoomIn />
        </Button>
      </div>

      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-auto p-3 sm:p-4">
        {pdf && !viewerError ? (
          <PdfPages data={pdf} availableWidth={availableWidth} zoom={zoom} onError={setViewerError} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
            {viewerError ? (
              <p className="text-destructive">{viewerError}</p>
            ) : isCompiling ? (
              <>
                <Loader2 className="size-6 animate-spin" aria-hidden />
                <p>{statusLabel}</p>
              </>
            ) : (
              <>
                <p>O PDF aparece aqui depois da compilação.</p>
                <Button size="sm" onClick={onCompile}>
                  <Play />
                  Compilar
                </Button>
                <p className="text-xs">Atalho: Ctrl+S ou Ctrl+Enter (Cmd no Mac).</p>
              </>
            )}
          </div>
        )}
        {pdf && isCompiling && (
          <div className="pointer-events-none absolute right-3 top-3 flex items-center gap-2 rounded-md border bg-background px-2 py-1 text-xs shadow-sm">
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
            {statusLabel}
          </div>
        )}
      </div>

      {issues.length > 0 && (
        <div className="max-h-[40%] shrink-0 overflow-hidden border-t bg-background text-xs">
          <button
            type="button"
            className="flex h-8 w-full items-center gap-2 px-3 text-left font-medium hover:bg-muted"
            aria-expanded={issuesOpen}
            onClick={() => setIssuesOpen((open) => !open)}
          >
            <ChevronDown className={cn('size-3.5 transition-transform', !issuesOpen && '-rotate-90')} />
            {[errorCount > 0 && `${errorCount} ${errorCount === 1 ? 'erro' : 'erros'}`, warningCount > 0 && `${warningCount} ${warningCount === 1 ? 'aviso' : 'avisos'}`]
              .filter(Boolean)
              .join(', ')}
          </button>
          {issuesOpen && (
            <ul className="max-h-48 overflow-y-auto pb-2">
              {issues.map((issue, index) => {
                const Icon = ISSUE_ICONS[issue.kind];
                const location = issue.file ? `${issue.file}${issue.line ? `:${issue.line}` : ''}` : null;
                return (
                  <li key={index}>
                    <button
                      type="button"
                      disabled={!issue.file}
                      onClick={() => onIssueSelect(issue)}
                      className="flex w-full min-w-0 items-start gap-2 px-3 py-1.5 text-left hover:bg-muted disabled:cursor-default disabled:hover:bg-transparent"
                    >
                      <Icon className={cn('mt-0.5 size-3.5 shrink-0', issue.kind === 'warning' ? 'text-warning' : 'text-destructive')} />
                      <span className="min-w-0 flex-1 break-words">{issue.message}</span>
                      {location && <span className="max-w-[45%] shrink-0 truncate font-mono text-muted-foreground">{location}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
