import { useQueryClient } from '@tanstack/react-query';
import { collection, doc, increment, serverTimestamp, writeBatch } from 'firebase/firestore';
import { getBytes, getMetadata, ref, uploadBytes } from 'firebase/storage';
import { useCallback } from 'react';
import { firestorePaths, storagePaths } from '@shared/firestore/paths';
import { downloadBytes, slugify } from '@/lib/download';
import { getFirebase, isFirebaseConfigured } from '@/lib/firebase/app';
import { classifyFileKind, fileNameOf, isTextPath } from '@/lib/project-archive/archive-paths';
import type { ImportPlan } from '@/lib/project-archive/import-plan';
import { buildZip } from '@/lib/project-archive/zip';
import { queryKeys } from '@/lib/query-keys';
import type { EditorFile } from '../model/editor-file';

/** Texto acima disso vai para o Storage: o documento do Firestore tem teto de 1 MiB. */
const INLINE_TEXT_LIMIT = 400 * 1024;
const BATCH_SIZE = 400;

/** Binários importados no modo demonstração (sem Firebase), para a exportação devolvê-los. */
const demoBlobs = new Map<string, Uint8Array>();

async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data as BufferSource);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Blob endereçado por hash: se já existe, o conteúdo é o mesmo e não precisa
 * subir de novo (as regras proíbem sobrescrever blob).
 */
async function uploadBlobIfMissing(path: string, data: Uint8Array): Promise<void> {
  const target = ref(getFirebase().storage, path);
  try {
    await getMetadata(target);
  } catch {
    await uploadBytes(target, data);
  }
}

/** Exportação do projeto em .zip e aplicação de um plano de importação. */
export function useProjectArchive(projectId: string) {
  const queryClient = useQueryClient();

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
        entries.push({ path: file.path, data: new Uint8Array(await getBytes(ref(getFirebase().storage, file.blobPath))) });
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
            };
            const index = next.findIndex((item) => item.id === id);
            if (index >= 0) next[index] = file;
            else next.push(file);
          }
          return next;
        });
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
        const blobPath = inline ? null : storagePaths.blob(projectId, contentHash);
        if (blobPath) await uploadBlobIfMissing(blobPath, entry.data);

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
    },
    [projectId, queryClient],
  );

  return { exportZip, applyImport };
}
