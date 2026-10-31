import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { PdfDocumentView } from '@/features/pdf-viewer/components/pdf-document-view';
import { cn } from '@/lib/utils';
import type { VisualDiff } from '../hooks/use-visual-diff';

const KIND_CLASSES = { add: 'bg-diff-added', del: 'bg-diff-removed', mod: 'bg-annotation-1' } as const;

interface DiffPdfViewerProps {
  diff: VisualDiff | null;
  /** Texto do andamento enquanto gera ou baixa. */
  loadingLabel: string | null;
  error: string | null;
  fileName: string;
}

/**
 * PDF recompilado com as alterações marcadas (inserido em verde sublinhado,
 * removido riscado em vermelho), marcas na margem de cada alteração e a barra
 * "Anterior" e "Próxima alteração".
 */
export function DiffPdfViewer({ diff, loadingLabel, error, fileName }: DiffPdfViewerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(-1);
  const changes = diff?.changes ?? [];

  const goTo = (index: number) => {
    const change = changes[index];
    const area = scrollRef.current;
    const page = area?.querySelector<HTMLElement>(`[data-pdf-page="${change?.page}"]`);
    if (!change || !area || !page) return;
    setCurrent(index);
    area.scrollTo({ top: page.offsetTop + change.y * page.offsetHeight - area.clientHeight / 3, behavior: 'smooth' });
  };

  if (error) return <p className="p-6 text-sm text-destructive">{error}</p>;
  if (!diff || !diff.pdf) {
    return (
      <p className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        {loadingLabel ? <Loader2 className="size-4 animate-spin" /> : null}
        {loadingLabel ?? 'A comparação em PDF não compilou; veja a aba Texto.'}
      </p>
    );
  }

  const counter = changes.length === 0 ? 'Nenhuma alteração marcada' : current < 0 ? `${changes.length} alterações` : `${current + 1} de ${changes.length}`;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PdfDocumentView
        pdf={diff.pdf}
        fileName={fileName}
        scrollRef={scrollRef}
        title={
          <span className="text-xs font-normal">
            <span className="text-diff-added">+{diff.stats.insertedWords}</span> <span className="text-diff-removed">-{diff.stats.deletedWords}</span>{' '}
            <span className="hidden text-muted-foreground xs:inline">{diff.granularity === 'paragraph' ? '(por parágrafo)' : ''}</span>
          </span>
        }
        actions={
          <div className="flex shrink-0 items-center gap-0.5">
            <span className="hidden px-1 tabular-nums sm:inline">{counter}</span>
            <Button variant="ghost" size="icon" className="size-8" aria-label="Alteração anterior" disabled={changes.length === 0} onClick={() => goTo(current <= 0 ? changes.length - 1 : current - 1)}>
              <ChevronUp />
            </Button>
            <Button variant="ghost" size="icon" className="size-8" aria-label="Próxima alteração" disabled={changes.length === 0} onClick={() => goTo(current >= changes.length - 1 ? 0 : current + 1)}>
              <ChevronDown />
            </Button>
          </div>
        }
        renderOverlay={(page) => (
          <>
            {changes.map((change, index) =>
              change.page === page ? (
                <span
                  key={change.id}
                  title={change.preview}
                  style={{ top: `${change.y * 100}%` }}
                  className={cn('pointer-events-none absolute left-0 h-4 w-1 -translate-y-1/2 rounded-r', KIND_CLASSES[change.kind], index === current && 'w-2')}
                />
              ) : null,
            )}
            {changes[current]?.page === page && (
              <span
                aria-hidden
                style={{ top: `${changes[current]!.y * 100}%` }}
                className="pointer-events-none absolute inset-x-1 h-6 -translate-y-1/2 animate-pulse rounded bg-annotation-1/30"
              />
            )}
          </>
        )}
      />
    </div>
  );
}
