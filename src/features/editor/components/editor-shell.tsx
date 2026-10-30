import { AiAssistantPanel } from '@/features/ai-assistant/components/ai-assistant-panel';
import { useLayoutMode } from '@/hooks/use-layout-mode';
import { DesktopWorkspace } from './desktop-workspace';
import { EditorHeader } from './editor-header';
import { FileTreeSheet } from './file-tree-sheet';
import { MobileWorkspace } from './mobile-workspace';

/**
 * Casca do editor. A raiz ocupa exatamente a altura visível (.h-viewport =
 * 100dvh) com overflow-hidden: o cabeçalho fica travado e só o conteúdo
 * interno de cada painel rola.
 */
export function EditorShell({ projectName }: { projectName: string }) {
  const layoutMode = useLayoutMode();

  return (
    <div className="flex h-viewport flex-col overflow-hidden bg-background">
      <EditorHeader projectName={projectName} layoutMode={layoutMode} />

      <main className="relative min-h-0 flex-1 overflow-hidden">
        {layoutMode === 'desktop' ? (
          <DesktopWorkspace />
        ) : (
          <MobileWorkspace orientation={layoutMode === 'mobile-landscape' ? 'landscape' : 'portrait'} />
        )}
      </main>

      {layoutMode !== 'desktop' && <FileTreeSheet />}
      <AiAssistantPanel layoutMode={layoutMode} />
    </div>
  );
}
