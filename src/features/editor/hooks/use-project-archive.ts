import { useMonaco } from '@monaco-editor/react';
import { useQueryClient } from '@tanstack/react-query';
import { collection, doc, increment, serverTimestamp, writeBatch } from 'firebase/firestore';
import { useCallback } from 'react';
import { firestorePaths } from '@shared/firestore/paths';
import { downloadBytes, slugify } from '@/lib/download';
import { getFirebase, isFirebaseConfigured } from '@/lib/firebase/app';
import { readStoredFile, writeStoredFile } from '@/lib/firebase/stored-files';
import { classifyFileKind, contentTypeOf, fileNameOf, isTextPath } from '@/lib/project-archive/archive-paths';
import type { ImportPlan } from '@/lib/project-archive/import-plan';
import { buildZip } from '@/lib/project-archive/zip';
import { queryKeys } from '@/lib/query-keys';
import { sha256Hex } from '@/lib/stored-files/chunks';
import type { EditorFile } from '../model/editor-file';

/** Texto acima disso vira blob em pedaços: o documento do Firestore tem teto de 1 MiB. */
const INLINE_TEXT_LIMIT = 400 * 1024;
const BATCH_SIZE = 400;

/** Binários importados no modo demonstração (sem Firebase), para a exportação devolvê-los. */
const demoBlobs = new Map<string, Uint8Array>();

/** Exportação do projeto em .zip e aplicação de um plano de importação. */
export function useProjectArchive(projectId: string) {
  const queryClient = useQueryClient();
  const monaco = useMonaco();

  /**
   * O Monaco guarda um modelo por caminho e não relê o arquivo: sem isto, um
   * texto sobrescrito pela importação continuaria antigo na tela (e seria o
   * compilado e o salvo na próxima edição).
   */
  const refreshOpenModels = useCallback(
    (plan: ImportPlan) => {
      const decoder = new TextDecoder();
      for (const { entry, targetPath, action } of plan.operations) {
        if (action !== 'overwrite' || !isTextPath(targetPath)) continue;
        const model = monaco?.editor.getModels().find((candidate) => candidate.uri.path.replace(/^\//, '') === targetPath);
        const content = decoder.decode(entry.data);
        if (model && model.getValue() !== content) model.setValue(content);
      }
    },
    [monaco],
  );

  const exportZip = useCallback(async (files: readonly EditorFile[], projectName: string) => {
    const encoder = new TextEncoder();
    const entries: Array<{ path: string; data: Uint8Array }> = [];
    const missing: string[] = [];
    for (const file of files) {
      if (file.kind === 'folder') continue;
      const demo = demoBlobs.get(file.id);
      if (file.content !== null) entries.push({ path: file.path, data: encoder.encode(file.content) });
      else if (demo) entries.push({ path: file.path, data: demo });
      else if (isFirebaseConfigured && file.blobPath) {
        entries.push({ path: file.path, data: (await readStoredFile(getFirebase().db, file.blobPath)).data });
      } else missing.push(file.path);
    }
    downloadBytes(buildZip(entries), `${slugify(projectName)}.zip`, 'application/zip');
    return { exported: entries.length, missing };
  }, []);

  const applyImport = useCallback(
    async (plan: ImportPlan, current: readonly EditorFile[]) => {
      const byPath = new Map(current.map((file) => [file.path, file]));
      const decoder = new TextDecoder();

      if (!isFirebaseConfigured) {
        // Modo demonstração: os arquivos entram só no cache desta aba.
        queryClient.setQueryData<EditorFile[]>(queryKeys.files(projectId), (old = []) => {
          const next = [...old];
          for (const { entry, targetPath, action } of plan.operations) {
            const existing = action === 'overwrite' ? byPath.get(targetPath) : undefined;
            const id = existing?.id ?? crypto.randomUUID();
            const content = isTextPath(targetPath) ? decoder.decode(entry.data) : null;
            if (content === null) demoBlobs.set(id, entry.data);
            const file: EditorFile = {
              id,
              path: targetPath,
              name: fileNameOf(targetPath),
              kind: classifyFileKind(targetPath),
              content,
              blobPath: null,
              size: entry.data.length,
              updatedAt: Date.now(),
            };
            const index = next.findIndex((item) => item.id === id);
            if (index >= 0) next[index] = file;
            else next.push(file);
          }
          return next;
        });
        refreshOpenModels(plan);
        return;
      }

      const { db, auth } = getFirebase();
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error('Faça login para importar arquivos.');

      let batch = writeBatch(db);
      let pending = 0;
      for (const { entry, targetPath, action } of plan.operations) {
        const inline = isTextPath(targetPath) && entry.data.byteLength <= INLINE_TEXT_LIMIT;
        const contentHash = await sha256Hex(entry.data);
        const blobPath = inline ? null : firestorePaths.blob(projectId, contentHash);
        // Endereçado pelo hash: se o blob já existe, o conteúdo é o mesmo e nada sobe.
        if (blobPath) {
          await writeStoredFile(db, blobPath, entry.data, { contentType: contentTypeOf(targetPath), uid, sha256: contentHash });
        }

        const existing = action === 'overwrite' ? byPath.get(targetPath) : undefined;
        const target = existing
          ? doc(db, firestorePaths.file(projectId, existing.id))
          : doc(collection(db, firestorePaths.files(projectId)));
        batch.set(
          target,
          {
            name: fileNameOf(targetPath),
            path: targetPath,
            // As pastas são derivadas dos caminhos (ver docs/06-banco-de-dados.md).
            parentId: null,
            kind: classifyFileKind(targetPath),
            content: inline ? decoder.decode(entry.data) : null,
            blobPath,
            contentHash,
            size: entry.data.byteLength,
            revision: increment(1),
            updatedAt: serverTimestamp(),
            updatedBy: uid,
          },
          { merge: true },
        );
        pending++;
        if (pending === BATCH_SIZE) {
          await batch.commit();
          batch = writeBatch(db);
          pending = 0;
        }
      }
      if (pending > 0) await batch.commit();
      refreshOpenModels(plan);
    },
    [projectId, queryClient, refreshOpenModels],
  );

  return { exportZip, applyImport };
}
