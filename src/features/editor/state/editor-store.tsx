import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

export type EditorPane = 'code' | 'pdf';

/** Pedido para o editor de código mostrar uma linha (vem da lista de erros da compilação). */
export interface RevealRequest {
  fileId: string;
  line: number;
  /** Muda a cada pedido, para repetir a mesma linha. */
  nonce: number;
}

interface EditorStore {
  projectId: string;
  projectName: string;
  activeFileId: string;
  /** Painel visível no celular em retrato (no desktop os dois aparecem). */
  activePane: EditorPane;
  fileTreeOpen: boolean;
  aiOpen: boolean;
  importOpen: boolean;
  revealRequest: RevealRequest | null;
  openFile: (fileId: string) => void;
  revealLine: (fileId: string, line: number) => void;
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
  const [revealRequest, setRevealRequest] = useState<RevealRequest | null>(null);

  const value = useMemo<EditorStore>(
    () => ({
      projectId,
      projectName,
      activeFileId,
      activePane,
      fileTreeOpen,
      aiOpen,
      importOpen,
      revealRequest,
      openFile: (fileId) => {
        setActiveFileId(fileId);
        setActivePane('code');
        setFileTreeOpen(false);
      },
      revealLine: (fileId, line) => {
        setActiveFileId(fileId);
        setActivePane('code');
        setRevealRequest((previous) => ({ fileId, line, nonce: (previous?.nonce ?? 0) + 1 }));
      },
      setActivePane,
      setFileTreeOpen,
      setAiOpen,
      setImportOpen,
    }),
    [projectId, projectName, activeFileId, activePane, fileTreeOpen, aiOpen, importOpen, revealRequest],
  );

  return <EditorStoreContext.Provider value={value}>{children}</EditorStoreContext.Provider>;
}

export function useEditorStore(): EditorStore {
  const store = useContext(EditorStoreContext);
  if (!store) throw new Error('useEditorStore precisa estar dentro de <EditorStoreProvider>.');
  return store;
}
