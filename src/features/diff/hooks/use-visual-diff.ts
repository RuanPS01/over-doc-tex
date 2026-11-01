import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useCallback } from 'react';
import { firestorePaths } from '@shared/firestore/paths';
import type { DiffDoc, SnapshotDoc } from '@shared/firestore/types';
import { useProjectSources } from '@/features/editor/hooks/use-project-sources';
import { useSnapshotFiles } from '@/features/snapshots/hooks/use-snapshot-files';
import { DIFF_ENGINE_VERSION } from '@/lib/diff/latex-diff';
import { compileVisualDiff, type DiffTreeFile, type VisualDiffResult } from '@/lib/diff/visual-diff';
import { getFirebase } from '@/lib/firebase/app';
import { readChunks, writeChunks } from '@/lib/firebase/stored-files';
import { t } from '@/lib/i18n';
import { isTextPath } from '@/lib/project-archive/archive-paths';

export function diffKeyOf(baseSnapshotId: string, targetSnapshotId: string, documentId: string): string {
  return `${baseSnapshotId}_${targetSnapshotId}_${documentId}_${DIFF_ENGINE_VERSION}`;
}

/** Diff pronto para exibir (do cache ou gerado agora). */
export type VisualDiff = Omit<VisualDiffResult, 'issues'> & { issues: VisualDiffResult['issues']; fromCache: boolean };

/**
 * Lê o diff guardado em diffs/{diffKey} (membros, ou o revisor com o documento
 * no grant da versão nova). Nulo quando ainda não foi gerado.
 */
export async function readCachedDiff(projectId: string, diffKey: string): Promise<VisualDiff | null> {
  const { db } = getFirebase();
  const path = firestorePaths.diff(projectId, diffKey);
  const snapshot = await getDoc(doc(db, path));
  if (!snapshot.exists()) return null;
  const data = snapshot.data() as DiffDoc;
  return {
    pdf: data.pdf ? await readChunks(db, path, data.pdf) : null,
    granularity: data.granularity,
    changes: data.changes ?? [],
    stats: { ...data.stats },
    issues: [],
    fromCache: true,
  };
}

/** Grava o diff uma vez (as regras proíbem alterar); o PDF vai em pedaços no próprio documento. */
async function saveDiff(projectId: string, diffKey: string, meta: { documentId: string; baseSnapshotId: string; targetSnapshotId: string }, result: VisualDiffResult) {
  const { db, auth } = getFirebase();
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  const path = firestorePaths.diff(projectId, diffKey);
  const ref = doc(db, path);
  const base = {
    ...meta,
    engineVersion: DIFF_ENGINE_VERSION,
    granularity: result.granularity,
    stats: result.stats,
    changes: result.changes.slice(0, 500),
    createdBy: uid,
    createdAt: serverTimestamp(),
  };
  if (!result.pdf) {
    await setDoc(ref, { ...base, pdf: null });
    return;
  }
  await writeChunks(db, path, result.pdf, {
    contentType: 'application/pdf',
    isFinalized: async () => (await getDoc(ref)).exists(),
    finalize: (batch, info) => batch.set(ref, { ...base, pdf: info }),
  });
}

/**
 * Diff visual em PDF entre duas versões (com cache) ou entre uma versão e o
 * rascunho (só para quem está editando, sem cache). Lê o código dos blobs,
 * então só membros geram; o revisor lê o que foi guardado.
 */
export function useVisualDiff(projectId: string) {
  const { readSources } = useSnapshotFiles(projectId);
  const collectSources = useProjectSources(projectId);

  const treeOf = useCallback(
    async (snapshot: SnapshotDoc): Promise<Map<string, DiffTreeFile>> => {
      const contents = await readSources(snapshot.files);
      const decoder = new TextDecoder();
      return new Map(
        snapshot.files.map((file) => {
          const data = contents.get(file.path)!;
          return [file.path, isTextPath(file.path) ? { text: decoder.decode(data) } : { data }] as const;
        }),
      );
    },
    [readSources],
  );

  const readSnapshot = useCallback(
    async (snapshotId: string) => {
      const data = (await getDoc(doc(getFirebase().db, firestorePaths.snapshot(projectId, snapshotId)))).data() as SnapshotDoc | undefined;
      if (!data) throw new Error(t('Versão não encontrada.'));
      return data;
    },
    [projectId],
  );

  /** Entre duas versões: usa o cache; se não houver, gera e (quem edita) guarda. */
  const betweenVersions = useCallback(
    async (baseSnapshotId: string, targetSnapshotId: string, documentId: string, canSave: boolean): Promise<VisualDiff> => {
      const key = diffKeyOf(baseSnapshotId, targetSnapshotId, documentId);
      const cached = await readCachedDiff(projectId, key).catch(() => null);
      if (cached) return cached;
      const [base, target] = await Promise.all([readSnapshot(baseSnapshotId), readSnapshot(targetSnapshotId)]);
      const rootPath = target.documents[documentId]?.rootPath ?? base.documents[documentId]?.rootPath;
      if (!rootPath) throw new Error(t('O documento não existe nas duas versões.'));
      const result = await compileVisualDiff(await treeOf(base), await treeOf(target), rootPath);
      if (canSave) await saveDiff(projectId, key, { documentId, baseSnapshotId, targetSnapshotId }, result).catch(() => undefined);
      return { ...result, fromCache: false };
    },
    [projectId, readSnapshot, treeOf],
  );

  /** Versão contra o rascunho como está na tela (não vai para o cache: o rascunho muda). */
  const againstDraft = useCallback(
    async (baseSnapshotId: string, documentId: string): Promise<VisualDiff> => {
      const base = await readSnapshot(baseSnapshotId);
      const { texts, binaries } = await collectSources(null);
      const target = new Map<string, DiffTreeFile>([
        ...texts.map((file) => [file.path, { text: file.content }] as const),
        ...[...binaries].map(([path, binary]) => [path, { data: binary.data }] as const),
      ]);
      const rootPath = base.documents[documentId]?.rootPath;
      if (!rootPath) throw new Error(t('O documento não existe na versão base.'));
      return { ...(await compileVisualDiff(await treeOf(base), target, rootPath)), fromCache: false };
    },
    [collectSources, readSnapshot, treeOf],
  );

  return { betweenVersions, againstDraft };
}
