import { useMonaco } from '@monaco-editor/react';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import { getFirebase, isFirebaseConfigured } from '@/lib/firebase/app';
import { readStoredFile } from '@/lib/firebase/stored-files';
import { t } from '@/lib/i18n';
import { pickMainFile, type ProjectTextFile, type TexIssue } from '@/lib/latex/prepare';
import { queryKeys } from '@/lib/query-keys';
import type { EditorFile } from '../model/editor-file';

export interface ProjectBinary {
  data: Uint8Array;
  /** sha256 do conteúdo (o id do blob). */
  hash: string;
}

export interface ProjectSources {
  texts: ProjectTextFile[];
  /** Por caminho: binários e textos grandes, que ficam em blobs. */
  binaries: Map<string, ProjectBinary>;
  /** Arquivo principal; nulo quando nenhum .tex tem \documentclass. */
  mainPath: string | null;
  /** Arquivos que não puderam ser lidos. */
  loadIssues: TexIssue[];
}

/**
 * Junta o projeto como ele está na tela: o texto vem dos modelos do Monaco
 * quando o arquivo está aberto (mesmo antes do salvamento automático) e do
 * cache dos arquivos nos demais; binários vêm dos arquivos em pedaços do
 * Firestore e ficam em memória durante a sessão. Usado pela compilação e
 * pelo congelamento de versões.
 */
export function useProjectSources(projectId: string) {
  const queryClient = useQueryClient();
  const monaco = useMonaco();
  const binaryCache = useRef(new Map<string, Uint8Array>());

  return useCallback(
    async (preferredFileId: string | null): Promise<ProjectSources> => {
      const files = queryClient.getQueryData<EditorFile[]>(queryKeys.files(projectId)) ?? [];
      const preferredPath = files.find((file) => file.id === preferredFileId)?.path ?? null;
      const openTexts = new Map<string, string>();
      for (const model of monaco?.editor.getModels() ?? []) {
        openTexts.set(model.uri.path.replace(/^\//, ''), model.getValue());
      }

      const texts: ProjectTextFile[] = files
        .filter((file) => file.kind !== 'folder' && file.content !== null)
        .map((file) => ({ path: file.path, content: openTexts.get(file.path) ?? file.content! }));

      const binaries = new Map<string, ProjectBinary>();
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
                binaries.set(file.path, { data, hash: blobPath.slice(blobPath.lastIndexOf('/') + 1) });
              } catch {
                loadIssues.push({ kind: 'warning', message: t('Não foi possível carregar {path}.', { path: file.path }), file: file.path, line: null });
              }
            }),
        );
      }
      return { texts, binaries, mainPath: pickMainFile(texts, preferredPath), loadIssues };
    },
    [projectId, queryClient, monaco],
  );
}
