import { useDefaultLayout, type LayoutStorage } from 'react-resizable-panels';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { PdfPreviewPanel } from '@/features/pdf-viewer/components/pdf-preview-panel';
import { CodeEditorPanel } from './code-editor-panel';
import { FileTreePanel } from './file-tree-panel';

/** localStorage pode falhar (aba anônima, cota): o layout salvo é só conveniência. */
const safeStorage: LayoutStorage = {
  getItem: (key) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Ignorado de propósito.
    }
  },
};

/** Desktop: árvore | editor | PDF em colunas redimensionáveis, com layout lembrado. */
export function DesktopWorkspace() {
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({ id: 'editor-desktop', storage: safeStorage });

  return (
    <ResizablePanelGroup orientation="horizontal" defaultLayout={defaultLayout} onLayoutChanged={onLayoutChanged}>
      <ResizablePanel id="files" defaultSize="18%" minSize="12%" maxSize="32%" collapsible collapsedSize="0%">
        <FileTreePanel />
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel id="code" defaultSize="41%" minSize="25%">
        <CodeEditorPanel />
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel id="pdf" defaultSize="41%" minSize="25%">
        <PdfPreviewPanel />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
