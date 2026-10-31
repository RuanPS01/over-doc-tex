import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

export type EditorPane = 'code' | 'pdf';

interface EditorStore {
  projectId: string;
  projectName: string;
  activeFileId: string;
  /** Painel visível no celular em retrato (no desktop os dois aparecem). */
  activePane: EditorPane;
  fileTreeOpen: boolean;
  aiOpen: boolean;
  importOpen: boolean;
  openFile: (fileId: string) => void;
  setActivePane: (pane: EditorPane) => void;
  setFileTreeOpen: (open: boolean) => void;
  setAiOpen: (open: boolean) => void;
  setImportOpen: (open: boolean) => void;
}

const EditorStoreContext = createContext<EditorStore | null>(null);

/** Estado de interface do editor. Dados do servidor ficam no React Query, não aqui. */
export function EditorStoreProvider({
  projectId,
  projectName,
  initialFileId,
  children,
}: {
  projectId: string;
  projectName: string;
  initialFileId: string;
  children: ReactNode;
}) {
  const [activeFileId, setActiveFileId] = useState(initialFileId);
  const [activePane, setActivePane] = useState<EditorPane>('code');
  const [fileTreeOpen, setFileTreeOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const value = useMemo<EditorStore>(
    () => ({
      projectId,
      projectName,
      activeFileId,
      activePane,
      fileTreeOpen,
      aiOpen,
      importOpen,
      openFile: (fileId) => {
        setActiveFileId(fileId);
        setActivePane('code');
        setFileTreeOpen(false);
      },
      setActivePane,
      setFileTreeOpen,
      setAiOpen,
      setImportOpen,
    }),
    [projectId, projectName, activeFileId, activePane, fileTreeOpen, aiOpen, importOpen],
  );

  return <EditorStoreContext.Provider value={value}>{children}</EditorStoreContext.Provider>;
}

export function useEditorStore(): EditorStore {
  const store = useContext(EditorStoreContext);
  if (!store) throw new Error('useEditorStore precisa estar dentro de <EditorStoreProvider>.');
  return store;
}
