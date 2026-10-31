import { arrayUnion, collection, doc, increment, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { useMemo } from 'react';
import { firestorePaths } from '@shared/firestore/paths';
import type { CommentDoc, ParticipantRole, PinAnchor, ReviewStatus, ThreadDoc, ThreadStatus } from '@shared/firestore/types';
import { memberProfileOf } from '@/features/projects/model/new-project';
import { getFirebase } from '@/lib/firebase/app';
import type { ReviewSummary } from '../model/review';

function currentUser() {
  const user = getFirebase().auth.currentUser;
  if (!user) throw new Error('Entre na sua conta para comentar.');
  return user;
}

type NewComment = Omit<CommentDoc, 'createdAt'> & { createdAt: unknown };

/**
 * Gravações da revisão, cada uma no formato que as regras conferem: thread
 * nova junto com o primeiro comentário; resposta junto com o contador da
 * thread (+1); status da thread; status da revisão (revisor ou autor).
 */
export function useReviewActions(review: ReviewSummary | null | undefined, role: ParticipantRole) {
  return useMemo(() => {
    const db = () => getFirebase().db;
    const projectId = review?.projectId ?? '';
    const reviewId = review?.id ?? '';

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
      createPin: async (page: number, point: { x: number; y: number }, body: string) => {
        if (!review) return;
        const user = currentUser();
        const anchor: PinAnchor = { type: 'pin', page, point, drawing: null };
        const threadRef = doc(collection(db(), firestorePaths.threads(projectId, reviewId)));
        const thread: Omit<ThreadDoc, 'createdAt' | 'updatedAt' | 'lastCommentAt'> & Record<'createdAt' | 'updatedAt' | 'lastCommentAt', unknown> = {
          projectId,
          reviewId,
          snapshotId: review.snapshotId,
          documentId: review.grantedDocumentIds[0]!,
          kind: 'pin',
          anchor,
          status: 'open',
          resolution: null,
          sourceHint: null,
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
        return threadRef.id;
      },

      reply: async (threadId: string, body: string) => {
        const user = currentUser();
        const batch = writeBatch(db());
        batch.set(doc(collection(db(), firestorePaths.comments(projectId, reviewId, threadId))), comment(body));
        batch.update(doc(db(), firestorePaths.thread(projectId, reviewId, threadId)), {
          commentCount: increment(1),
          participantIds: arrayUnion(user.uid),
          lastCommentAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        await batch.commit();
      },

      setThreadStatus: (threadId: string, status: Extract<ThreadStatus, 'open' | 'resolved'>) => {
        const user = currentUser();
        return updateDoc(doc(db(), firestorePaths.thread(projectId, reviewId, threadId)), {
          status,
          // O autor corrige na próxima versão; o revisor só dá por respondido.
          resolution:
            status === 'resolved'
              ? { kind: role === 'author' ? 'fixed_next_version' : 'answered', by: user.uid, at: serverTimestamp(), fixedInSnapshotId: null }
              : null,
          updatedAt: serverTimestamp(),
        });
      },

      /** Revisor: na primeira abertura registra quem é e passa para "Em revisão". */
      markOpened: () => {
        const user = currentUser();
        return updateDoc(doc(db(), firestorePaths.review(projectId, reviewId)), {
          reviewerUid: user.uid,
          reviewerName: memberProfileOf(user).name,
          status: 'in_review',
          lastActivityAt: serverTimestamp(),
        });
      },

      setReviewStatus: (status: ReviewStatus) =>
        updateDoc(doc(db(), firestorePaths.review(projectId, reviewId)), {
          status,
          lastActivityAt: serverTimestamp(),
          ...(role === 'author' ? { closedAt: status === 'closed' ? serverTimestamp() : null } : {}),
        }),
    };
  }, [review, role]);
}
