import { useMonaco } from '@monaco-editor/react';
import { useQueryClient } from '@tanstack/react-query';
import { collection, deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { useCallback } from 'react';
import { firestorePaths } from '@shared/firestore/paths';
import { getFirebase, isFirebaseConfigured } from '@/lib/firebase/app';
import { t } from '@/lib/i18n';
import { classifyFileKind, fileNameOf, isTextPath, normalizeArchivePath } from '@/lib/project-archive/archive-paths';
import { queryKeys } from '@/lib/query-keys';
import { sha256Hex } from '@/lib/stored-files/chunks';
import type { EditorFile } from '../model/editor-file';

export class FileActionError extends Error {}

/** Caminho digitado pela pessoa, já normalizado e conferido contra os arquivos existentes. */
export function validateNewPath(raw: string, files: readonly EditorFile[], ignoreId?: string): string {
  const path = normalizeArchivePath(raw.trim());
  if (!path) throw new FileActionError(t('Caminho inválido. Use algo como capitulos/introducao.tex.'));
  if (files.some((file) => file.id !== ignoreId && file.path === path)) throw new FileActionError(t('Já existe um arquivo com esse caminho.'));
  if (files.some((file) => file.id !== ignoreId && file.path.startsWith(`${path}/`))) throw new FileActionError(t('Já existe uma pasta com esse nome.'));
  return path;
}

/**
 * Criar, renomear e excluir arquivos do rascunho. As pastas vêm dos
 * caminhos: "capitulos/novo.tex" cria a pasta junto. No modo demonstração,
 * as mudanças ficam só no cache da aba.
 */
export function useFileActions(projectId: string) {
  const queryClient = useQueryClient();
  const monaco = useMonaco();
  const filesKey = queryKeys.files(projectId);
  const modelOf = useCallback(
    (path: string) => monaco?.editor.getModels().find((model) => model.uri.path.replace(/^\//, '') === path) ?? null,
    [monaco],
  );

  const createFile = useCallback(
    async (rawPath: string, files: readonly EditorFile[]): Promise<string> => {
      const path = validateNewPath(rawPath, files);
      if (!isTextPath(path)) throw new FileActionError(t('Crie arquivos de texto (.tex, .bib, .sty, .txt...). Imagens e PDFs entram por Importar.'));
      if (!isFirebaseConfigured) {
        const id = crypto.randomUUID();
        queryClient.setQueryData<EditorFile[]>(filesKey, (old = []) => [
          ...old,
          { id, path, name: fileNameOf(path), kind: classifyFileKind(path), content: '', blobPath: null, size: 0, updatedAt: Date.now() },
        ]);
        return id;
      }
      const { db, auth } = getFirebase();
      const uid = auth.currentUser?.uid;
      if (!uid) throw new FileActionError(t('Entre na sua conta para criar arquivos.'));
      const ref = doc(collection(db, firestorePaths.files(projectId)));
      await setDoc(ref, {
        name: fileNameOf(path),
        path,
        parentId: null,
        kind: classifyFileKind(path),
        content: '',
        blobPath: null,
        contentHash: await sha256Hex(new Uint8Array()),
        size: 0,
        revision: 1,
        updatedAt: serverTimestamp(),
        updatedBy: uid,
      });
      return ref.id;
    },
    [filesKey, projectId, queryClient],
  );

  const renameFile = useCallback(
    async (file: EditorFile, rawPath: string, files: readonly EditorFile[]): Promise<void> => {
      const path = validateNewPath(rawPath, files, file.id);
      if (path === file.path) return;
      // O texto da tela vai junto: o modelo novo do Monaco nasce do cache, e o antigo some.
      const model = modelOf(file.path);
      const content = file.content !== null ? (model?.getValue() ?? file.content) : null;
      const patch = { name: fileNameOf(path), path, kind: classifyFileKind(path), ...(content !== null ? { content } : {}) };
      if (isFirebaseConfigured) {
        const { db, auth } = getFirebase();
        const uid = auth.currentUser?.uid;
        if (!uid) throw new FileActionError(t('Entre na sua conta para renomear arquivos.'));
        await updateDoc(doc(db, firestorePaths.file(projectId, file.id)), { ...patch, updatedAt: serverTimestamp(), updatedBy: uid });
      }
      queryClient.setQueryData<EditorFile[]>(filesKey, (old = []) => old.map((item) => (item.id === file.id ? { ...item, ...patch } : item)));
      // Depois que o editor trocar para o modelo novo.
      setTimeout(() => model?.dispose(), 0);
    },
    [filesKey, modelOf, projectId, queryClient],
  );

  const deleteFile = useCallback(
    async (file: EditorFile): Promise<void> => {
      if (isFirebaseConfigured) await deleteDoc(doc(getFirebase().db, firestorePaths.file(projectId, file.id)));
      const model = modelOf(file.path);
      queryClient.setQueryData<EditorFile[]>(filesKey, (old = []) => old.filter((item) => item.id !== file.id));
      setTimeout(() => model?.dispose(), 0);
    },
    [filesKey, modelOf, projectId, queryClient],
  );

  return { createFile, renameFile, deleteFile };
}
