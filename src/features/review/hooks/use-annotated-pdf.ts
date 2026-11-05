import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { useCallback } from 'react';
import { firestorePaths } from '@shared/firestore/paths';
import type { AnnotationColor, CommentDoc } from '@shared/firestore/types';
import { hslChannelsToRgb, readColorToken } from '@/lib/color';
import { getFirebase } from '@/lib/firebase/app';
import { getLocale, t } from '@/lib/i18n';
import { buildAnnotatedPdf, type AnnotatedPdfComment, type AnnotatedPdfPalette, type AnnotatedPdfThread } from '@/lib/pdf/annotated-pdf';
import { toCommentSummary, type ReviewSummary, type ThreadSummary } from '../model/review';

const ANNOTATION_TOKENS: AnnotationColor[] = ['annotation-1', 'annotation-2', 'annotation-3', 'annotation-4'];

/**
 * Cores do PDF anotado, lidas dos tokens na hora: --export-* (papel branco,
 * iguais no tema claro e no escuro) e --annotation-* (as do revisor).
 */
function readPalette(): AnnotatedPdfPalette {
  const color = (token: string) => hslChannelsToRgb(readColorToken(token));
  return {
    ink: color('export-ink'),
    muted: color('export-muted'),
    rule: color('export-rule'),
    panel: color('export-panel'),
    paper: color('export-paper'),
    pinText: color('export-pin-text'),
    annotation: Object.fromEntries(ANNOTATION_TOKENS.map((token) => [token, color(token)])) as Record<AnnotationColor, ReturnType<typeof color>>,
  };
}

/**
 * "PDF com anotações" (download da revisão): lê os comentários de cada thread
 * do documento (e os da rodada anterior, nas threads levadas adiante) e
 * desenha marcações e comentários sobre o PDF original da versão.
 */
export function useAnnotatedPdf(review: ReviewSummary) {
  const { projectId, id: reviewId, previousReviewId, number, snapshotLabel } = review;

  return useCallback(
    async (pdf: Uint8Array, threads: ReadonlyArray<{ thread: ThreadSummary; number: number }>): Promise<Uint8Array> => {
      const { db } = getFirebase();
      const dateFormat = new Intl.DateTimeFormat(getLocale(), { dateStyle: 'short', timeStyle: 'short' });
      const readComments = async (fromReviewId: string, threadId: string): Promise<AnnotatedPdfComment[]> => {
        const snapshot = await getDocs(query(collection(db, firestorePaths.comments(projectId, fromReviewId, threadId)), orderBy('createdAt')));
        return snapshot.docs
          .map((item) => toCommentSummary(item.id, item.data({ serverTimestamps: 'estimate' }) as CommentDoc))
          .filter((comment) => comment.body.trim())
          .map((comment) => ({
            author: comment.authorRole === 'reviewer' ? `${comment.authorName} ${t('(revisor)')}` : comment.authorName,
            date: comment.createdAt ? dateFormat.format(comment.createdAt) : '',
            body: comment.body,
          }));
      };

      const exported = await Promise.all(
        threads.map(async ({ thread, number: threadNumber }): Promise<AnnotatedPdfThread> => {
          const [comments, previousRound] = await Promise.all([
            readComments(reviewId, thread.id),
            // A conversa antiga é melhor esforço: a revisão anterior pode não estar liberada para quem baixa.
            thread.carriedFromThreadId && previousReviewId ? readComments(previousReviewId, thread.carriedFromThreadId).catch(() => []) : Promise.resolve([]),
          ]);
          const state = thread.status === 'resolved' ? 'resolved' : thread.status === 'outdated' ? 'outdated' : 'open';
          return {
            number: threadNumber,
            anchor: thread.anchor,
            state,
            kindLabel: thread.anchor.type === 'text' ? t('Trecho') : thread.anchor.drawing ? t('Desenho') : t('Ponto'),
            statusLabel:
              state === 'resolved' ? (thread.resolution?.fixedInSnapshotId ? t('Corrigida') : t('Resolvida')) : state === 'outdated' ? t('Desatualizada') : '',
            previousRound,
            comments,
          };
        }),
      );

      const heading = t('Revisão #{number} · versão {version} · comentários', { number, version: snapshotLabel });
      return buildAnnotatedPdf(pdf, {
        threads: exported,
        palette: readPalette(),
        text: {
          heading,
          summaryTitle: t('Comentários completos'),
          continued: t('Continua no fim do PDF, em Comentários completos.'),
          previousRound: t('Rodada anterior'),
          page: (page) => t('Página {page}', { page }),
          hiddenOnPage: (count) =>
            count === 1 ? t('Mais 1 comentário no fim do PDF, em Comentários completos.') : t('Mais {count} comentários no fim do PDF, em Comentários completos.', { count }),
        },
      });
    },
    [projectId, reviewId, previousReviewId, number, snapshotLabel],
  );
}
