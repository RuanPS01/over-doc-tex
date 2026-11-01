import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLayoutMode } from '@/hooks/use-layout-mode';
import { t } from '@/lib/i18n';
import type { CompileStage } from '@/lib/latex/compiler';
import type { TexIssue } from '@/lib/latex/prepare';
import { pdfAt, type SyncData } from '@/lib/latex/synctex';
import { useLatexCompile, type ProjectCompileOutcome } from '../hooks/use-latex-compile';
import { useEditorStore } from './editor-store';

interface CompileStore {
  isCompiling: boolean;
  stage: CompileStage | null;
  /** Último PDF gerado com sucesso: continua na tela quando a compilação seguinte falha. */
  pdf: Uint8Array | null;
  /** SyncTeX desse PDF, para ir do PDF ao código e de volta. */
  synctex: SyncData | null;
  /** Ponto do PDF a mostrar (busca direta do SyncTeX), em pontos do PDF. */
  pdfFocus: { page: number; yPt: number; nonce: number } | null;
  /** Mostra no PDF o trecho gerado pela linha do código; falso se o SyncTeX não achou. */
  showInPdf: (path: string, line: number) => boolean;
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
  const [synctex, setSynctex] = useState<SyncData | null>(null);
  const [pdfFocus, setPdfFocus] = useState<CompileStore['pdfFocus']>(null);
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
          setSynctex(outcome.synctex);
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
          synctex: null,
          issues: [{ kind: 'error', message: t('Não foi possível iniciar o compilador: {error}', { error: String(error) }), file: null, line: null } satisfies TexIssue],
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

  const showInPdf = useCallback(
    (path: string, line: number) => {
      const found = synctex ? pdfAt(synctex, path, line) : null;
      if (!found) return false;
      setPdfFocus((previous) => ({ page: found.page, yPt: found.y, nonce: (previous?.nonce ?? 0) + 1 }));
      if (layoutMode === 'mobile-portrait') setActivePane('pdf');
      return true;
    },
    [synctex, layoutMode, setActivePane],
  );

  const value = useMemo<CompileStore>(
    () => ({ isCompiling, stage, pdf, synctex, pdfFocus, showInPdf, last, compile }),
    [isCompiling, stage, pdf, synctex, pdfFocus, showInPdf, last, compile],
  );
  return <CompileStoreContext.Provider value={value}>{children}</CompileStoreContext.Provider>;
}

export function useCompileStore(): CompileStore {
  const store = useContext(CompileStoreContext);
  if (!store) throw new Error('useCompileStore precisa estar dentro de <CompileStoreProvider>.');
  return store;
}
