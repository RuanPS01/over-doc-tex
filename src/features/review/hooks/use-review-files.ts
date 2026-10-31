import { useEffect, useState } from 'react';
import { useSnapshotFiles } from '@/features/snapshots/hooks/use-snapshot-files';
import { diffText, normalizePdfText, type DiffSegment } from '@/lib/diff/word-diff';
import type { ReviewSummary } from '../model/review';

/** PDF da versão em revisão (membros e o revisor com o documento no grant). */
export function useReviewPdf(review: ReviewSummary) {
  const { readPdf } = useSnapshotFiles(review.projectId);
  const [pdf, setPdf] = useState<Uint8Array | null>(null);
  const [error, setError] = useState<string | null>(null);
  const documentId = review.grantedDocumentIds[0]!;

  useEffect(() => {
    let cancelled = false;
    readPdf(review.snapshotId, documentId)
      .then((data) => !cancelled && setPdf(data))
      .catch(() => !cancelled && setError('Não foi possível abrir o PDF desta versão.'));
    return () => {
      cancelled = true;
    };
  }, [readPdf, review.snapshotId, documentId]);

  return { pdf, error };
}

/**
 * Diff do texto das páginas da versão anterior com o da versão em revisão.
 * O revisor não lê o código-fonte, só o texto guardado com cada versão (.pages).
 */
export function usePageTextDiff(review: ReviewSummary, enabled: boolean) {
  const { readPageTexts } = useSnapshotFiles(review.projectId);
  const [segments, setSegments] = useState<DiffSegment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const documentId = review.grantedDocumentIds[0]!;

  useEffect(() => {
    if (!enabled || !review.baseSnapshotId) return;
    let cancelled = false;
    setSegments(null);
    setError(null);
    Promise.all([readPageTexts(review.baseSnapshotId, documentId), readPageTexts(review.snapshotId, documentId)])
      .then(([before, after]) => !cancelled && setSegments(diffText(normalizePdfText(before), normalizePdfText(after))))
      .catch(() => !cancelled && setError('Não foi possível ler a versão anterior. Ela pode não ter sido liberada para você.'));
    return () => {
      cancelled = true;
    };
  }, [enabled, review.baseSnapshotId, review.snapshotId, documentId, readPageTexts]);

  return { segments, error };
}
