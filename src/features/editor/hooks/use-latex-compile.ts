import { useMonaco } from '@monaco-editor/react';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import { getFirebase, isFirebaseConfigured } from '@/lib/firebase/app';
import { readStoredFile } from '@/lib/firebase/stored-files';
import { compileLatex, type CompileStage, type LatexCompileResult } from '@/lib/latex/compiler';
import { buildCompileInput, pickMainFile, type ProjectTextFile, type TexIssue } from '@/lib/latex/prepare';
import { queryKeys } from '@/lib/query-keys';
import type { EditorFile } from '../model/editor-file';

export interface ProjectCompileOutcome extends LatexCompileResult {
  /** Arquivo compilado; nulo quando nenhum .tex tem \documentclass. */
  mainPath: string | null;
}

/**
 * Compila o projeto aberto. O texto vem dos modelos do Monaco quando o
 * arquivo está aberto (o que está na tela, mesmo antes do salvamento
 * automático) e do cache dos arquivos nos demais; binários vêm dos arquivos
 * em pedaços do Firestore, guardados em memória durante a sessão.
 */
export function useLatexCompile(projectId: string) {
  const queryClient = useQueryClient();
  const monaco = useMonaco();
  const binaryCache = useRef(new Map<string, Uint8Array>());

  return useCallback(
    async (activeFileId: string | null, onStage: (stage: CompileStage) => void): Promise<ProjectCompileOutcome> => {
      const files = queryClient.getQueryData<EditorFile[]>(queryKeys.files(projectId)) ?? [];
      const preferredPath = files.find((file) => file.id === activeFileId)?.path ?? null;
      const openTexts = new Map<string, string>();
      for (const model of monaco?.editor.getModels() ?? []) {
        openTexts.set(model.uri.path.replace(/^\//, ''), model.getValue());
      }

      const texts: ProjectTextFile[] = files
        .filter((file) => file.kind !== 'folder' && file.content !== null)
        .map((file) => ({ path: file.path, content: openTexts.get(file.path) ?? file.content! }));
      const mainPath = pickMainFile(texts, preferredPath);
      if (!mainPath) {
        return {
          ok: false,
          pdf: null,
          mainPath: null,
          durationMs: 0,
          issues: [{ kind: 'error', message: 'Nenhum arquivo .tex com \\documentclass no projeto.', file: null, line: null }],
        };
      }

      const binaries = new Map<string, Uint8Array>();
      const loadIssues: TexIssue[] = [];
      if (isFirebaseConfigured) {
        await Promise.all(
          files
            .filter((file) => file.content === null && file.blobPath)
            .map(async (file) => {
              const blobPath = file.blobPath!;
              try {
                let data = binaryCache.current.get(blobPath);
                if (!data) {
                  data = (await readStoredFile(getFirebase().db, blobPath)).data;
                  binaryCache.current.set(blobPath, data);
                }
                binaries.set(file.path, data);
              } catch {
                loadIssues.push({ kind: 'warning', message: `Não foi possível carregar ${file.path}.`, file: file.path, line: null });
              }
            }),
        );
      }

      const result = await compileLatex(buildCompileInput(mainPath, texts, binaries), mainPath, onStage);
      return { ...result, issues: [...loadIssues, ...result.issues], mainPath };
    },
    [projectId, queryClient, monaco],
  );
}
