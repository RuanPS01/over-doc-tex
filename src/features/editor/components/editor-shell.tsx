import { useEffect, useRef } from 'react';
import { useLocation, useSearch } from 'wouter';
import { AiAssistantPanel } from '@/features/ai-assistant/components/ai-assistant-panel';
import { useLayoutMode } from '@/hooks/use-layout-mode';
import { useProjectFiles } from '../hooks/use-project-files';
import { pickFallbackFile } from '../model/editor-file';
import { CompileStoreProvider } from '../state/compile-store';
import { useEditorStore } from '../state/editor-store';
import { DesktopWorkspace } from './desktop-workspace';
import { EditorHeader } from './editor-header';
import { FileTreeSheet } from './file-tree-sheet';
import { ImportDialog } from './import-dialog';
import { MobileWorkspace } from './mobile-workspace';

/**
 * Casca do editor. A raiz ocupa exatamente a altura visível (.h-viewport =
 * 100dvh) com overflow-hidden: o cabeçalho fica travado e só o conteúdo
 * interno de cada painel rola.
 */
export function EditorShell() {
  const layoutMode = useLayoutMode();
  const { projectId, projectName, aiOpen, setAiOpen, activeFileId, openFile, revealLine } = useEditorStore();
  const { data: files = [] } = useProjectFiles(projectId);
  const search = useSearch();
  const [location, navigate] = useLocation();
  const handledSearch = useRef<string | null>(null);

  // "Abrir no código" de um comentário da revisão chega como ?arquivo=...&linha=...
  useEffect(() => {
    const params = new URLSearchParams(search);
    const path = params.get('arquivo');
    if (!path || files.length === 0 || handledSearch.current === search) return;
    handledSearch.current = search;
    const file = files.find((candidate) => candidate.path === path);
    if (file) revealLine(file.id, Number(params.get('linha')) || 1);
    navigate(location, { replace: true });
  }, [search, files, revealLine, navigate, location]);

  // O arquivo inicial (id "main") só existe em projetos criados pelo app.
  useEffect(() => {
    if (files.length === 0 || files.some((file) => file.id === activeFileId)) return;
    const fallback = pickFallbackFile(files);
    if (fallback) openFile(fallback.id);
  }, [files, activeFileId, openFile]);

  return (
    <CompileStoreProvider>
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
        <ImportDialog />
        <AiAssistantPanel layoutMode={layoutMode} open={aiOpen} onOpenChange={setAiOpen} files={files} />
      </div>
    </CompileStoreProvider>
  );
}
