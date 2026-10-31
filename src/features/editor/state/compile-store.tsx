import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLayoutMode } from '@/hooks/use-layout-mode';
import type { CompileStage } from '@/lib/latex/compiler';
import type { TexIssue } from '@/lib/latex/prepare';
import { useLatexCompile, type ProjectCompileOutcome } from '../hooks/use-latex-compile';
import { useEditorStore } from './editor-store';

interface CompileStore {
  isCompiling: boolean;
  stage: CompileStage | null;
  /** Último PDF gerado com sucesso: continua na tela quando a compilação seguinte falha. */
  pdf: Uint8Array | null;
  /** Resultado da última compilação (sucesso ou falha). */
  last: ProjectCompileOutcome | null;
  compile: () => void;
}

const CompileStoreContext = createContext<CompileStore | null>(null);

/**
 * Estado da compilação do projeto aberto, compartilhado pelo botão Compilar
 * e pelo painel do PDF. Ctrl+S ou Ctrl+Enter (Cmd no Mac) também compilam.
 */
export function CompileStoreProvider({ children }: { children: ReactNode }) {
  const { projectId, activeFileId, setActivePane } = useEditorStore();
  const runCompile = useLatexCompile(projectId);
  const layoutMode = useLayoutMode();
  const [isCompiling, setIsCompiling] = useState(false);
  const [stage, setStage] = useState<CompileStage | null>(null);
  const [pdf, setPdf] = useState<Uint8Array | null>(null);
  const [last, setLast] = useState<ProjectCompileOutcome | null>(null);
  const busy = useRef(false);
  // O arquivo aberto vira o principal se tiver \documentclass.
  const activeFileRef = useRef<string | null>(null);
  activeFileRef.current = activeFileId;

  const compile = useCallback(() => {
    if (busy.current) return;
    busy.current = true;
    setIsCompiling(true);
    void runCompile(activeFileRef.current, setStage)
      .then((outcome) => {
        setLast(outcome);
        if (outcome.pdf) {
          setPdf(outcome.pdf);
          // No celular em retrato só um painel aparece: mostra o resultado.
          if (layoutMode === 'mobile-portrait') setActivePane('pdf');
        }
      })
      .catch((error: unknown) => {
        setLast({
          ok: false,
          pdf: null,
          mainPath: null,
          durationMs: 0,
          issues: [{ kind: 'error', message: `Não foi possível iniciar o compilador: ${String(error)}`, file: null, line: null } satisfies TexIssue],
        });
      })
      .finally(() => {
        busy.current = false;
        setIsCompiling(false);
        setStage(null);
      });
  }, [runCompile, layoutMode, setActivePane]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      if (event.key === 's' || event.key === 'S' || event.key === 'Enter') {
        event.preventDefault();
        compile();
      }
    };
    // Fase de captura: o Monaco não chega a consumir o atalho.
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [compile]);

  const value = useMemo<CompileStore>(
    () => ({ isCompiling, stage, pdf, last, compile }),
    [isCompiling, stage, pdf, last, compile],
  );
  return <CompileStoreContext.Provider value={value}>{children}</CompileStoreContext.Provider>;
}

export function useCompileStore(): CompileStore {
  const store = useContext(CompileStoreContext);
  if (!store) throw new Error('useCompileStore precisa estar dentro de <CompileStoreProvider>.');
  return store;
}
