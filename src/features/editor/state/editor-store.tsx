import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

export type EditorPane = 'code' | 'pdf';

interface EditorStore {
  projectId: string;
  activeFileId: string;
  /** Painel visível no celular em retrato (no desktop os dois aparecem). */
  activePane: EditorPane;
  fileTreeOpen: boolean;
  aiOpen: boolean;
  openFile: (fileId: string) => void;
  setActivePane: (pane: EditorPane) => void;
  setFileTreeOpen: (open: boolean) => void;
  setAiOpen: (open: boolean) => void;
}

const EditorStoreContext = createContext<EditorStore | null>(null);

/** Estado de interface do editor. Dados do servidor ficam no React Query, não aqui. */
export function EditorStoreProvider({
  projectId,
  initialFileId,
  children,
}: {
  projectId: string;
  initialFileId: string;
  children: ReactNode;
}) {
  const [activeFileId, setActiveFileId] = useState(initialFileId);
  const [activePane, setActivePane] = useState<EditorPane>('code');
  const [fileTreeOpen, setFileTreeOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  const value = useMemo<EditorStore>(
    () => ({
      projectId,
      activeFileId,
      activePane,
      fileTreeOpen,
      aiOpen,
      openFile: (fileId) => {
        setActiveFileId(fileId);
        setActivePane('code');
        setFileTreeOpen(false);
      },
      setActivePane,
      setFileTreeOpen,
      setAiOpen,
    }),
    [projectId, activeFileId, activePane, fileTreeOpen, aiOpen],
  );

  return <EditorStoreContext.Provider value={value}>{children}</EditorStoreContext.Provider>;
}

export function useEditorStore(): EditorStore {
  const store = useContext(EditorStoreContext);
  if (!store) throw new Error('useEditorStore precisa estar dentro de <EditorStoreProvider>.');
  return store;
}
