import { collection, doc, getDocs, query, serverTimestamp, where, writeBatch } from 'firebase/firestore';
import { useCallback } from 'react';
import { firestorePaths } from '@shared/firestore/paths';
import type { PinAnchor, SourceLocation, ThreadAnchor, ThreadDoc, ThreadStatus } from '@shared/firestore/types';
import { useSnapshotFiles } from '@/features/snapshots/hooks/use-snapshot-files';
import { getFirebase } from '@/lib/firebase/app';
import { pdfAt, sourceAt, type SyncData } from '@/lib/latex/synctex';
import { createTextLocator, type TextLocator } from '@/lib/pdf/page-text';
import { reanchorQuote } from '@/lib/pdf/reanchor';
import { collapseSpaces, contextAt } from '@/lib/pdf/text-anchor';

const BATCH_LIMIT = 400;
const clamp = (value: number) => Math.round(Math.min(1, Math.max(0, value)) * 10_000) / 10_000;

interface DocumentView {
  pages: string[];
  locator: TextLocator;
  sync: SyncData | null;
}

/** Pin levado para a versão nova: segue a linha do código pelo SyncTeX; sem ele, fica no mesmo lugar. */
function movePin(anchor: PinAnchor, hint: SourceLocation | null, view: DocumentView): PinAnchor {
  const pageCount = view.locator.pageSizes.length;
  const target = hint && view.sync ? pdfAt(view.sync, hint.path, hint.line) : null;
  const size = target ? view.locator.pageSizes[target.page - 1] : undefined;
  if (!target || !size) return { ...anchor, page: Math.min(anchor.page, pageCount) };
  const dy = clamp(target.y / size.height) - anchor.point.y;
  const shift = (points: number[]) => points.map((value, index) => (index % 2 === 1 ? clamp(value + dy) : value));
  return {
    type: 'pin',
    page: target.page,
    point: { x: anchor.point.x, y: clamp(anchor.point.y + dy) },
    drawing: anchor.drawing
      ? {
          strokes: anchor.drawing.strokes.map((stroke) => ({ ...stroke, points: shift(stroke.points) })),
          bounds: { ...anchor.drawing.bounds, y: clamp(anchor.drawing.bounds.y + dy) },
        }
      : null,
  };
}

/**
 * Leva as threads ainda abertas da rodada anterior para a revisão nova
 * (docs/07-fluxos.md, "Resposta e resolução", passo 4). Cada uma ganha
 * `carriedFromThreadId` e é reancorada na versão nova: trecho pela citação e
 * pelo contexto no `.pages`, com os retângulos refeitos pelo pdf.js; pin pela
 * linha do código (SyncTeX). Trecho que não aparece mais vira "desatualizada".
 * Os comentários continuam na thread antiga e a tela mostra os dois.
 */
export function useCarryThreads(projectId: string) {
  const { readPdf, readPageTexts, readSyncData } = useSnapshotFiles(projectId);

  return useCallback(
    async (previousReviewId: string, review: { id: string; snapshotId: string; grantedDocumentIds: readonly string[] }): Promise<number> => {
      const { db, auth } = getFirebase();
      const uid = auth.currentUser?.uid;
      if (!uid) return 0;
      const open = await getDocs(query(collection(db, firestorePaths.threads(projectId, previousReviewId)), where('status', '==', 'open')));
      const threads = open.docs.map((item) => ({ id: item.id, data: item.data() as ThreadDoc })).filter(({ data }) => review.grantedDocumentIds.includes(data.documentId));
      if (threads.length === 0) return 0;

      const views = new Map<string, Promise<DocumentView>>();
      const viewOf = (documentId: string) => {
        let view = views.get(documentId);
        if (!view) {
          view = (async () => ({
            pages: await readPageTexts(review.snapshotId, documentId),
            locator: await createTextLocator(await readPdf(review.snapshotId, documentId)),
            sync: await readSyncData(review.snapshotId, documentId).catch(() => null),
          }))();
          views.set(documentId, view);
        }
        return view;
      };

      let batch = writeBatch(db);
      let pending = 0;
      try {
        for (const { id, data } of threads) {
          const view = await viewOf(data.documentId);
          let anchor: ThreadAnchor = data.anchor;
          let status: ThreadStatus = 'open';
          let sourceHint = data.sourceHint;
          if (data.anchor.type === 'text') {
            const match = reanchorQuote(view.pages, data.anchor);
            const rects = match ? await view.locator.rectsFor(match.page, match.start, match.end) : [];
            if (match && rects.length > 0) {
              const pageText = view.pages[match.page - 1]!;
              anchor = {
                type: 'text',
                page: match.page,
                rects,
                // A citação passa a ser o texto da versão nova; a antiga continua na thread de origem.
                quote: { exact: collapseSpaces(pageText.slice(match.start, match.end)), ...contextAt(pageText, match.start, match.end) },
                position: { start: match.start, end: match.end },
              };
              const size = view.locator.pageSizes[match.page - 1];
              const first = rects[0]!;
              const found = view.sync && size ? sourceAt(view.sync, match.page, (first.x + 0.01) * size.width, (first.y + first.height / 2) * size.height) : null;
              if (found) sourceHint = { path: found.path, line: found.line, column: null };
            } else status = 'outdated';
          } else anchor = movePin(data.anchor, data.sourceHint, view);

          const thread: Omit<ThreadDoc, 'createdAt' | 'updatedAt' | 'lastCommentAt'> & Record<'createdAt' | 'updatedAt' | 'lastCommentAt', unknown> = {
            projectId,
            reviewId: review.id,
            snapshotId: review.snapshotId,
            documentId: data.documentId,
            kind: data.kind,
            anchor,
            status,
            resolution: null,
            sourceHint,
            carriedFromThreadId: id,
            createdBy: uid,
            createdByRole: data.createdByRole,
            commentCount: 0,
            participantIds: [uid],
            lastCommentAt: data.lastCommentAt ?? null,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          batch.set(doc(collection(db, firestorePaths.threads(projectId, review.id))), thread);
          if (++pending === BATCH_LIMIT) {
            await batch.commit();
            batch = writeBatch(db);
            pending = 0;
          }
        }
        if (pending > 0) await batch.commit();
      } finally {
        for (const view of views.values()) void view.then((loaded) => loaded.locator.close()).catch(() => undefined);
      }
      return threads.length;
    },
    [projectId, readPdf, readPageTexts, readSyncData],
  );
}
