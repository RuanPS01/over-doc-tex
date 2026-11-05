import { arrayUnion, collection, doc, getDocs, increment, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
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
import { t } from '@/lib/i18n';
import { REVIEW_STATUS_LABELS, type ReviewSummary, type ReviewViewer, type ThreadSummary } from '../model/review';

function currentUser() {
  const user = getFirebase().auth.currentUser;
  if (!user) throw new Error(t('Entre na sua conta para comentar.'));
  return user;
}

type NewComment = Omit<CommentDoc, 'createdAt'> & { createdAt: unknown };

/** O que a pessoa marcou no PDF: um ponto (com ou sem desenho) ou um trecho de texto. */
export type NewAnnotation =
  | { kind: 'pin'; page: number; point: NormalizedPoint; drawing: Drawing | null }
  | { kind: 'text'; anchor: TextAnchor };

const firstLine = (body: string) => body.split('\n')[0]!.slice(0, 200);

/**
 * Revisor que entrou pelo link: sem conta, o nome digitado e a identidade (o
 * nome normalizado); com conta (viaAccount), o nome da conta e accountGuestKey.
 */
export interface GuestIdentity {
  name: string;
  key: string;
  viaAccount?: boolean;
}

/** Teto de gravações de um lote do Firestore: a thread e os comentários saem juntos. */
const MAX_BATCH_WRITES = 500;

/** Quem está vendo a revisão (conta, nome do visitante e se edita o projeto). */
export function useReviewViewer(guest: GuestIdentity | null, canEditProject: boolean): ReviewViewer {
  const uid = getFirebase().auth.currentUser?.uid ?? null;
  const guestKey = guest && !guest.viaAccount ? guest.key : null;
  return useMemo(() => ({ uid, guestKey, canEditProject }), [uid, guestKey, canEditProject]);
}

const anchorOf = (annotation: NewAnnotation): ThreadAnchor =>
  annotation.kind === 'pin' ? { type: 'pin', page: annotation.page, point: annotation.point, drawing: annotation.drawing } : annotation.anchor;

/**
 * Gravações da revisão, cada uma no formato que as regras conferem: thread
 * nova junto com o primeiro comentário; resposta junto com o contador da
 * thread (+1); status da thread; status da revisão (revisor ou autor). Depois
 * de cada uma, notifica o outro lado (melhor esforço).
 */
export function useReviewActions(review: ReviewSummary | null | undefined, role: ParticipantRole, guest: GuestIdentity | null = null) {
  return useMemo(() => {
    const db = () => getFirebase().db;
    const projectId = review?.projectId ?? '';
    const reviewId = review?.id ?? '';
    // Montado na hora do envio, no idioma de quem envia.
    const label = () => (review ? t('{project}, revisão #{number}', { project: review.projectName, number: review.number }) : '');
    // O revisor fala com quem pediu; o autor, com o revisor.
    const otherSide = () => (role === 'reviewer' ? [review?.requestedBy] : [review?.reviewerUid]);

    // Visitante sem conta assina com o nome que informou e a chave do nome; com conta, vale o id da conta.
    const nameGuest = guest && !guest.viaAccount ? guest : null;
    const authorName = (user: { displayName: string | null; email: string | null }) => nameGuest?.name ?? memberProfileOf(user).name;

    const comment = (body: string): NewComment => {
      const user = currentUser();
      return {
        authorId: user.uid,
        authorName: authorName(user),
        authorKey: nameGuest?.key ?? null,
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
        const anchor = anchorOf(annotation);
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
          // Visitante sem conta: a thread leva a identidade do nome, para ele mexer nela de outro aparelho.
          authorKey: nameGuest?.key ?? null,
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
          title: t('Novo comentário: {review}', { review: label() }),
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
          title: t('Resposta: {review}', { review: label() }),
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
          title: status === 'resolved' ? t('Comentário resolvido: {review}', { review: label() }) : t('Comentário reaberto: {review}', { review: label() }),
          body: '',
        });
      },

      /**
       * Marcação nova para a mesma thread: o pin arrastado (com o desenho) ou a marcação refeita
       * (outro ponto, desenho ou trecho). A thread desatualizada volta a aberta.
       */
      moveThread: async (thread: ThreadSummary, annotation: NewAnnotation, sourceHint: SourceLocation | null) => {
        currentUser();
        await updateDoc(doc(db(), firestorePaths.thread(projectId, reviewId, thread.id)), {
          kind: annotation.kind,
          anchor: anchorOf(annotation),
          sourceHint,
          status: thread.status === 'outdated' ? 'open' : thread.status,
          updatedAt: serverTimestamp(),
        });
      },

      /** Exclui a thread (a marcação e a conversa): os comentários saem no mesmo lote, como as regras exigem. */
      deleteThread: async (thread: ThreadSummary) => {
        currentUser();
        const comments = await getDocs(collection(db(), firestorePaths.comments(projectId, reviewId, thread.id)));
        if (comments.size + 1 > MAX_BATCH_WRITES) throw new Error(t('Esta conversa tem comentários demais para excluir de uma vez.'));
        const batch = writeBatch(db());
        for (const item of comments.docs) batch.delete(item.ref);
        batch.delete(doc(db(), firestorePaths.thread(projectId, reviewId, thread.id)));
        await batch.commit();
      },

      /** O autor corrige o texto do próprio comentário. */
      editComment: async (thread: ThreadSummary, commentId: string, body: string) => {
        currentUser();
        await updateDoc(doc(db(), firestorePaths.comment(projectId, reviewId, thread.id, commentId)), { body, editedAt: serverTimestamp() });
      },

      /** O autor exclui a própria resposta: o registro fica na conversa, sem o texto. */
      deleteComment: async (thread: ThreadSummary, commentId: string) => {
        currentUser();
        await updateDoc(doc(db(), firestorePaths.comment(projectId, reviewId, thread.id, commentId)), { body: '', deletedAt: serverTimestamp() });
      },

      /** Revisor: na primeira abertura registra quem é e passa para "Em revisão". */
      markOpened: async () => {
        const user = currentUser();
        await updateDoc(doc(db(), firestorePaths.review(projectId, reviewId)), {
          reviewerUid: user.uid,
          reviewerName: authorName(user),
          status: 'in_review',
          lastActivityAt: serverTimestamp(),
        });
        void sendNotifications([review?.requestedBy], {
          type: 'review_status_changed',
          projectId,
          reviewId,
          threadId: null,
          title: t('O revisor abriu: {review}', { review: label() }),
          body: t('{name} começou a revisar a versão {version}.', { name: authorName(user), version: review?.snapshotLabel ?? '' }),
        });
      },

      setReviewStatus: async (status: ReviewStatus) => {
        const user = currentUser();
        await updateDoc(doc(db(), firestorePaths.review(projectId, reviewId)), {
          status,
          lastActivityAt: serverTimestamp(),
          // Com vários revisores, fica registrado quem decidiu por último.
          ...(role === 'author'
            ? { closedAt: status === 'closed' ? serverTimestamp() : null }
            : { reviewerUid: user.uid, reviewerName: authorName(user) }),
        });
        void sendNotifications(otherSide(), {
          type: 'review_status_changed',
          projectId,
          reviewId,
          threadId: null,
          title: `${t(REVIEW_STATUS_LABELS[status])}: ${label()}`,
          body: '',
        });
      },
    };
  }, [review, role, guest]);
}
