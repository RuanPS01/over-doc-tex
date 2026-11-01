import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { firestorePaths } from '@shared/firestore/paths';
import type { SnapshotDoc } from '@shared/firestore/types';
import { diffKeyOf, readCachedDiff, useVisualDiff, type VisualDiff } from '@/features/diff/hooks/use-visual-diff';
import { useSnapshotFiles } from '@/features/snapshots/hooks/use-snapshot-files';
import { diffText, normalizePdfText, type DiffSegment } from '@/lib/diff/word-diff';
import { getFirebase } from '@/lib/firebase/app';
import { t } from '@/lib/i18n';
import type { SyncData } from '@/lib/latex/synctex';
import type { ReviewSummary } from '../model/review';

/** Documento concedido na revisão, com o título vindo da versão. */
export interface ReviewDocument {
  id: string;
  title: string;
  hasSynctex: boolean;
}

/** Carrega um valor da versão por documento, com cancelamento ao trocar (recarrega quando `deps` muda). */
function useSnapshotValue<T>(load: (() => Promise<T>) | null, deps: readonly unknown[], errorMessage: string) {
  const [value, setValue] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setValue(null);
    setError(null);
    if (!load) return;
    let cancelled = false;
    load()
      .then((data) => !cancelled && setValue(data))
      .catch(() => !cancelled && setError(errorMessage));
    return () => {
      cancelled = true;
    };
  }, deps);
  return { value, error };
}

/** Documentos que o revisor pode abrir nesta revisão (títulos lidos do snapshot). */
export function useReviewDocuments(review: ReviewSummary): ReviewDocument[] {
  const [documents, setDocuments] = useState<ReviewDocument[]>(() =>
    review.grantedDocumentIds.map((id) => ({ id, title: id === 'main' ? t('Documento principal') : id, hasSynctex: false })),
  );
  useEffect(() => {
    let cancelled = false;
    void getDoc(doc(getFirebase().db, firestorePaths.snapshot(review.projectId, review.snapshotId)))
      .then((snapshot) => {
        const data = snapshot.data() as SnapshotDoc | undefined;
        if (cancelled || !data) return;
        setDocuments(
          review.grantedDocumentIds
            .filter((id) => data.documents[id])
            .map((id) => ({ id, title: data.documents[id]!.title, hasSynctex: Boolean(data.documents[id]!.synctexPath) })),
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // A lista muda de referência a cada atualização da revisão; o conteúdo é o que importa.
  }, [review.projectId, review.snapshotId, review.grantedDocumentIds.join(',')]);
  return documents;
}

/** PDF de um documento da versão em revisão (membros e o revisor com o documento no grant). */
export function useReviewPdf(review: ReviewSummary, documentId: string) {
  const { readPdf } = useSnapshotFiles(review.projectId);
  const { value, error } = useSnapshotValue(() => readPdf(review.snapshotId, documentId), [readPdf, review.snapshotId, documentId], t('Não foi possível abrir o PDF desta versão.'));
  return { pdf: value, error };
}

/** Texto de cada página (o mesmo da camada de texto), para montar a citação dos comentários em trecho. */
export function useReviewPageTexts(review: ReviewSummary, documentId: string): string[] | null {
  const { readPageTexts } = useSnapshotFiles(review.projectId);
  return useSnapshotValue(() => readPageTexts(review.snapshotId, documentId), [readPageTexts, review.snapshotId, documentId], '').value;
}

/** SyncTeX do documento na versão, para guardar em cada comentário a linha do código (sourceHint). */
export function useReviewSyncData(review: ReviewSummary, documentId: string, enabled: boolean): SyncData | null {
  const { readSyncData } = useSnapshotFiles(review.projectId);
  return useSnapshotValue(enabled ? () => readSyncData(review.snapshotId, documentId) : null, [readSyncData, review.snapshotId, documentId, enabled], '').value;
}

/**
 * Diff do texto das páginas da versão anterior com o da versão em revisão.
 * O revisor não lê o código-fonte, só o texto guardado com cada versão (.pages).
 */
export function usePageTextDiff(review: ReviewSummary, documentId: string, enabled: boolean) {
  const { readPageTexts } = useSnapshotFiles(review.projectId);
  const base = review.baseSnapshotId;
  const { value, error } = useSnapshotValue<DiffSegment[]>(
    enabled && base
      ? async () => {
          const [before, after] = await Promise.all([readPageTexts(base, documentId), readPageTexts(review.snapshotId, documentId)]);
          return diffText(normalizePdfText(before), normalizePdfText(after));
        }
      : null,
    [enabled, base, review.snapshotId, documentId, readPageTexts],
    t('Não foi possível ler a versão anterior. Ela pode não ter sido liberada para você.'),
  );
  return { segments: value, error };
}

/**
 * Diff visual em PDF desde a rodada anterior. O autor lê o cache ou gera (e
 * guarda); o revisor só lê o que o autor guardou, porque não lê o código.
 */
export function useReviewVisualDiff(review: ReviewSummary, documentId: string, enabled: boolean, role: 'author' | 'reviewer') {
  const { betweenVersions } = useVisualDiff(review.projectId);
  const base = review.baseSnapshotId;
  const { value, error } = useSnapshotValue<VisualDiff | 'missing'>(
    enabled && base
      ? async () =>
          role === 'author'
            ? betweenVersions(base, review.snapshotId, documentId, true)
            : ((await readCachedDiff(review.projectId, diffKeyOf(base, review.snapshotId, documentId))) ?? 'missing')
      : null,
    [enabled, base, review.snapshotId, documentId, role, betweenVersions],
    t('Não foi possível abrir a comparação em PDF.'),
  );
  return { diff: value === 'missing' ? null : value, missing: value === 'missing', error };
}
