import { arrayUnion, collection, doc, increment, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { useMemo } from 'react';
import { firestorePaths } from '@shared/firestore/paths';
import type {
  CommentDoc,
  Drawing,
  NormalizedPoint,
  ParticipantRole,
  ReviewStatus,
  SourceLocation,
  TextAnchor,
  ThreadAnchor,
  ThreadDoc,
  ThreadStatus,
} from '@shared/firestore/types';
import { sendNotifications } from '@/features/notifications/hooks/use-notifications';
import { memberProfileOf } from '@/features/projects/model/new-project';
import { getFirebase } from '@/lib/firebase/app';
import { REVIEW_STATUS_LABELS, type ReviewSummary, type ThreadSummary } from '../model/review';

function currentUser() {
  const user = getFirebase().auth.currentUser;
  if (!user) throw new Error('Entre na sua conta para comentar.');
  return user;
}

type NewComment = Omit<CommentDoc, 'createdAt'> & { createdAt: unknown };

/** O que a pessoa marcou no PDF: um ponto (com ou sem desenho) ou um trecho de texto. */
export type NewAnnotation =
  | { kind: 'pin'; page: number; point: NormalizedPoint; drawing: Drawing | null }
  | { kind: 'text'; anchor: TextAnchor };

const firstLine = (body: string) => body.split('\n')[0]!.slice(0, 200);

/**
 * Gravações da revisão, cada uma no formato que as regras conferem: thread
 * nova junto com o primeiro comentário; resposta junto com o contador da
 * thread (+1); status da thread; status da revisão (revisor ou autor). Depois
 * de cada uma, notifica o outro lado (melhor esforço).
 */
export function useReviewActions(review: ReviewSummary | null | undefined, role: ParticipantRole) {
  return useMemo(() => {
    const db = () => getFirebase().db;
    const projectId = review?.projectId ?? '';
    const reviewId = review?.id ?? '';
    const label = review ? `${review.projectName}, revisão #${review.number}` : '';
    // O revisor fala com quem pediu; o autor, com o revisor.
    const otherSide = () => (role === 'reviewer' ? [review?.requestedBy] : [review?.reviewerUid]);

    const comment = (body: string): NewComment => {
      const user = currentUser();
      return {
        authorId: user.uid,
        authorName: memberProfileOf(user).name,
        authorPhotoURL: user.photoURL,
        authorRole: role,
        kind: 'comment',
        body,
        statusChange: null,
        createdAt: serverTimestamp(),
        editedAt: null,
        deletedAt: null,
      };
    };

    return {
      createThread: async (documentId: string, annotation: NewAnnotation, body: string, sourceHint: SourceLocation | null) => {
        if (!review) return;
        const user = currentUser();
        const anchor: ThreadAnchor =
          annotation.kind === 'pin'
            ? { type: 'pin', page: annotation.page, point: annotation.point, drawing: annotation.drawing }
            : annotation.anchor;
        const threadRef = doc(collection(db(), firestorePaths.threads(projectId, reviewId)));
        const thread: Omit<ThreadDoc, 'createdAt' | 'updatedAt' | 'lastCommentAt'> & Record<'createdAt' | 'updatedAt' | 'lastCommentAt', unknown> = {
          projectId,
          reviewId,
          snapshotId: review.snapshotId,
          documentId,
          kind: annotation.kind,
          anchor,
          status: 'open',
          resolution: null,
          sourceHint,
          carriedFromThreadId: null,
          createdBy: user.uid,
          createdByRole: role,
          commentCount: 1,
          participantIds: [user.uid],
          lastCommentAt: serverTimestamp(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        const batch = writeBatch(db());
        batch.set(threadRef, thread);
        batch.set(doc(collection(db(), firestorePaths.comments(projectId, reviewId, threadRef.id))), comment(body));
        await batch.commit();
        void sendNotifications(otherSide(), {
          type: 'thread_created',
          projectId,
          reviewId,
          threadId: threadRef.id,
          title: `Novo comentário: ${label}`,
          body: firstLine(body),
        });
        return threadRef.id;
      },

      reply: async (thread: ThreadSummary, body: string) => {
        const user = currentUser();
        const batch = writeBatch(db());
        batch.set(doc(collection(db(), firestorePaths.comments(projectId, reviewId, thread.id))), comment(body));
        batch.update(doc(db(), firestorePaths.thread(projectId, reviewId, thread.id)), {
          commentCount: increment(1),
          participantIds: arrayUnion(user.uid),
          lastCommentAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        await batch.commit();
        void sendNotifications([...thread.participantIds, ...otherSide()], {
          type: 'comment_added',
          projectId,
          reviewId,
          threadId: thread.id,
          title: `Resposta: ${label}`,
          body: firstLine(body),
        });
      },

      setThreadStatus: async (thread: ThreadSummary, status: Extract<ThreadStatus, 'open' | 'resolved'>) => {
        const user = currentUser();
        await updateDoc(doc(db(), firestorePaths.thread(projectId, reviewId, thread.id)), {
          status,
          // O autor corrige na próxima versão; o revisor só dá por respondido.
          resolution:
            status === 'resolved'
              ? { kind: role === 'author' ? 'fixed_next_version' : 'answered', by: user.uid, at: serverTimestamp(), fixedInSnapshotId: null }
              : null,
          updatedAt: serverTimestamp(),
        });
        void sendNotifications([thread.createdBy, ...thread.participantIds], {
          type: 'thread_resolved',
          projectId,
          reviewId,
          threadId: thread.id,
          title: `${status === 'resolved' ? 'Comentário resolvido' : 'Comentário reaberto'}: ${label}`,
          body: '',
        });
      },

      /** Revisor: na primeira abertura registra quem é e passa para "Em revisão". */
      markOpened: async () => {
        const user = currentUser();
        await updateDoc(doc(db(), firestorePaths.review(projectId, reviewId)), {
          reviewerUid: user.uid,
          reviewerName: memberProfileOf(user).name,
          status: 'in_review',
          lastActivityAt: serverTimestamp(),
        });
        void sendNotifications([review?.requestedBy], {
          type: 'review_status_changed',
          projectId,
          reviewId,
          threadId: null,
          title: `O revisor abriu: ${label}`,
          body: `${memberProfileOf(user).name} começou a revisar a versão ${review?.snapshotLabel ?? ''}.`,
        });
      },

      setReviewStatus: async (status: ReviewStatus) => {
        await updateDoc(doc(db(), firestorePaths.review(projectId, reviewId)), {
          status,
          lastActivityAt: serverTimestamp(),
          ...(role === 'author' ? { closedAt: status === 'closed' ? serverTimestamp() : null } : {}),
        });
        void sendNotifications(otherSide(), {
          type: 'review_status_changed',
          projectId,
          reviewId,
          threadId: null,
          title: `${REVIEW_STATUS_LABELS[status]}: ${label}`,
          body: '',
        });
      },
    };
  }, [review, role]);
}
