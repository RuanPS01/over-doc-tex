import { useDefaultLayout } from 'react-resizable-panels';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup, safeLayoutStorage } from '@/components/ui/resizable';
import { CodeEditorPanel } from './code-editor-panel';
import { PdfPane } from './pdf-pane';
import { FileTreePanel } from './file-tree-panel';

/** Desktop: árvore | editor | PDF em colunas redimensionáveis, com layout lembrado. */
export function DesktopWorkspace() {
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({ id: 'editor-desktop', storage: safeLayoutStorage });

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
        <PdfPane />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
