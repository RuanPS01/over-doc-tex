import { useCallback } from 'react';
import { compileLatex, type CompileStage, type LatexCompileResult } from '@/lib/latex/compiler';
import { buildCompileInput } from '@/lib/latex/prepare';
import { useProjectSources } from './use-project-sources';

export interface ProjectCompileOutcome extends LatexCompileResult {
  /** Arquivo compilado; nulo quando nenhum .tex tem \documentclass. */
  mainPath: string | null;
}

export const NO_MAIN_FILE_MESSAGE = 'Nenhum arquivo .tex com \\documentclass no projeto.';

/** Compila o projeto aberto como ele está na tela (ver useProjectSources). */
export function useLatexCompile(projectId: string) {
  const collectSources = useProjectSources(projectId);

  return useCallback(
    async (activeFileId: string | null, onStage: (stage: CompileStage) => void): Promise<ProjectCompileOutcome> => {
      const { texts, binaries, mainPath, loadIssues } = await collectSources(activeFileId);
      if (!mainPath) {
        return {
          ok: false,
          pdf: null,
          mainPath: null,
          durationMs: 0,
          synctex: null,
          issues: [{ kind: 'error', message: NO_MAIN_FILE_MESSAGE, file: null, line: null }],
        };
      }
      const data = new Map([...binaries].map(([path, binary]) => [path, binary.data]));
      const result = await compileLatex(buildCompileInput(mainPath, texts, data), mainPath, onStage);
      return { ...result, issues: [...loadIssues, ...result.issues], mainPath };
    },
    [collectSources],
  );
}
