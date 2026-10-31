import { FileText, ZoomIn, ZoomOut } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

const ZOOM_STEPS = [50, 75, 100, 125, 150, 200] as const;
const PAGE_COUNT = 3;

/**
 * Visualizador do PDF compilado. Nesta etapa as páginas são marcadores de
 * posição; a renderização real usa pdf.js com camadas de texto e anotação
 * (ver docs/04-componentes-e-telas.md).
 *
 * A largura das páginas acompanha o painel (w-full) e o zoom acima de 100%
 * gera rolagem horizontal apenas DENTRO deste painel, nunca no body.
 */
export function PdfPreviewPanel() {
  const [zoomIndex, setZoomIndex] = useState(2);
  const zoom = ZOOM_STEPS[zoomIndex] ?? 100;

  return (
    <section aria-label="Pré-visualização do PDF" className="flex h-full min-w-0 flex-col bg-pdf-canvas">
      <div className="flex h-9 shrink-0 items-center gap-1 border-b bg-background px-2 text-xs text-muted-foreground">
        <FileText className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate">main.pdf</span>
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
        <span className="w-10 text-center tabular-nums">{zoom}%</span>
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

      <div className="min-h-0 flex-1 overflow-auto p-3 sm:p-4">
        <div className="mx-auto flex flex-col gap-4" style={{ width: `${zoom}%`, maxWidth: `${(zoom / 100) * 820}px` }}>
          {Array.from({ length: PAGE_COUNT }, (_, page) => (
            <article
              key={page}
              aria-label={`Página ${page + 1}`}
              className="relative aspect-[1/1.414] w-full rounded-sm bg-card p-[8%] shadow-md"
            >
              <div className="mb-[6%] h-[3%] w-2/3 rounded bg-muted" />
              {[92, 100, 96, 88, 100, 74, 98, 90].map((width, line) => (
                <div key={line} className="mb-[2.5%] h-[1.4%] rounded bg-muted" style={{ width: `${width}%` }} />
              ))}
              <span className="absolute bottom-[3%] left-1/2 -translate-x-1/2 text-[10px] text-muted-foreground">
                {page + 1}
              </span>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
