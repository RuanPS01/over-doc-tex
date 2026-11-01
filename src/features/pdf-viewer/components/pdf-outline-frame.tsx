import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { useCollapsiblePanel } from '@/hooks/use-collapsible-panel';
import { cn } from '@/lib/utils';
import type { usePdfOutline } from '../hooks/use-pdf-outline';
import { PdfOutlinePanel } from './pdf-outline';

/** Largura inicial do índice ao lado das páginas. */
const OUTLINE_DEFAULT_PX = 224;

interface PdfOutlineFrameProps {
  outline: ReturnType<typeof usePdfOutline>;
  /** Medida pelo índice para decidir entre ao lado e por cima. */
  frameRef: RefObject<HTMLDivElement>;
  /** Onde a largura do índice fica lembrada (uma por tela: editor, revisão...). */
  widthKey: string;
  /** A área rolável das páginas. */
  children: ReactNode;
}

/**
 * Índice e páginas lado a lado num grupo redimensionável, como as colunas do
 * editor: a borda entre os dois arrasta para mudar a largura, e arrastar até a
 * borda recolhe o índice (o botão da barra também abre e fecha). A estrutura é
 * sempre a mesma, com ou sem índice: trocar a árvore desmontaria as páginas e
 * o PDF seria aberto de novo. Num visualizador estreito, o índice abre por cima.
 */
export function PdfOutlineFrame({ outline, frameRef, widthKey, children }: PdfOutlineFrameProps) {
  const side = useCollapsiblePanel(widthKey, OUTLINE_DEFAULT_PX);
  const sideAvailable = outline.available && !outline.overlay;
  const shouldOpen = sideAvailable && outline.open;
  const expected = useRef(shouldOpen);
  expected.current = shouldOpen;

  // O painel acompanha o estado (botão, índice carregado, largura do visualizador).
  useEffect(() => {
    if (shouldOpen) side.expand();
    else side.collapse();
  }, [shouldOpen, side.expand, side.collapse]);

  return (
    <div ref={frameRef} className="relative flex min-h-0 min-w-0 flex-1">
      <ResizablePanelGroup orientation="horizontal">
        <ResizablePanel
          id="outline"
          panelRef={side.panelRef}
          defaultSize={0}
          minSize={160}
          maxSize="50%"
          collapsible
          collapsedSize={0}
          groupResizeBehavior="preserve-pixel-size"
          onResize={(size) => {
            side.onResize(size);
            const collapsed = size.inPixels < 1;
            // Arrastado pela pessoa: fechar até a borda fecha o índice; puxar a borda abre.
            if (collapsed && expected.current) outline.setOpen(false);
            else if (!collapsed && !expected.current) {
              if (sideAvailable) outline.setOpen(true);
              else side.collapse();
            }
          }}
        >
          {shouldOpen && (
            <PdfOutlinePanel
              items={outline.items}
              activeId={outline.activeId}
              parents={outline.parents}
              overlay={false}
              onSelect={outline.goTo}
              onClose={() => outline.setOpen(false)}
            />
          )}
        </ResizablePanel>
        <ResizableHandle className={cn(!sideAvailable && 'hidden')} />
        <ResizablePanel id="pages" minSize="40%">
          <div className="flex h-full min-w-0">{children}</div>
        </ResizablePanel>
      </ResizablePanelGroup>
      {outline.overlay && outline.open && (
        <PdfOutlinePanel
          items={outline.items}
          activeId={outline.activeId}
          parents={outline.parents}
          overlay
          onSelect={outline.goTo}
          onClose={() => outline.setOpen(false)}
        />
      )}
    </div>
  );
}
