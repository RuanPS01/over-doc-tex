import { useCallback } from 'react';
import { firestorePaths, snapshotFileName } from '@shared/firestore/paths';
import type { SnapshotFileEntry } from '@shared/firestore/types';
import { getFirebase } from '@/lib/firebase/app';
import { readStoredFile } from '@/lib/firebase/stored-files';
import { parsePageTextFile } from '../model/version';

/**
 * Blobs são imutáveis (endereçados pelo hash): o que já foi lido na aba
 * serve para qualquer versão. O cache offline do Firestore cobre recargas.
 */
const blobCache = new Map<string, Promise<Uint8Array>>();

function readBlob(projectId: string, hash: string): Promise<Uint8Array> {
  const key = `${projectId}/${hash}`;
  let pending = blobCache.get(key);
  if (!pending) {
    pending = readStoredFile(getFirebase().db, firestorePaths.blob(projectId, hash)).then((file) => file.data);
    pending.catch(() => blobCache.delete(key));
    blobCache.set(key, pending);
  }
  return pending;
}

/** Leitura dos arquivos de uma versão: código (blobs), PDF e texto por página. */
export function useSnapshotFiles(projectId: string) {
  /** Conteúdo dos arquivos do manifesto, por caminho. */
  const readSources = useCallback(
    async (entries: readonly SnapshotFileEntry[]): Promise<Map<string, Uint8Array>> => {
      const pairs = await Promise.all(entries.map(async (entry) => [entry.path, await readBlob(projectId, entry.hash)] as const));
      return new Map(pairs);
    },
    [projectId],
  );

  const readPdf = useCallback(
    async (snapshotId: string, documentId: string) =>
      (await readStoredFile(getFirebase().db, firestorePaths.snapshotFile(projectId, snapshotId, snapshotFileName(documentId, 'pdf')))).data,
    [projectId],
  );

  const readPageTexts = useCallback(
    async (snapshotId: string, documentId: string) =>
      parsePageTextFile(
        (await readStoredFile(getFirebase().db, firestorePaths.snapshotFile(projectId, snapshotId, snapshotFileName(documentId, 'pages')))).data,
      ),
    [projectId],
  );

  return { readSources, readPdf, readPageTexts };
}
