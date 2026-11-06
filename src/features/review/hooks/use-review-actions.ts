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
  ThreadKind,
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

/** Onde a thread está marcada no PDF: o que o arraste e o "Refazer a marcação" trocam (e o desfazer devolve). */
export interface ThreadMarking {
  kind: ThreadKind;
  anchor: ThreadAnchor;
  sourceHint: SourceLocation | null;
}

export const markingOf = (thread: Pick<ThreadSummary, 'kind' | 'anchor' | 'sourceHint'>): ThreadMarking => ({
  kind: thread.kind,
  anchor: thread.anchor,
  sourceHint: thread.sourceHint,
});

/** Quem está vendo a revisão (conta, nome do visitante e se edita o projeto). */
export function useReviewViewer(guest: GuestIdentity | null, canEditProject: boolean): ReviewViewer {
  const uid = getFirebase().auth.currentUser?.uid ?? null;
  const guestKey = guest && !guest.viaAccount ? guest.key : null;
  return useMemo(() => ({ uid, guestKey, canEditProject }), [uid, guestKey, canEditProject]);
}

const anchorOf = (annotation: NewAnnotation): ThreadAnchor =>
  annotation.kind === 'pin' ? { type: 'pin', page: annotation.page, point: annotation.point, drawing: annotation.drawing } : annotation.anchor;

/** Marcação nova a partir do que a pessoa marcou no PDF. */
export const markingFrom = (annotation: NewAnnotation, sourceHint: SourceLocation | null): ThreadMarking => ({
  kind: annotation.kind,
  anchor: anchorOf(annotation),
  sourceHint,
});

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
        const commentRef = doc(collection(db(), firestorePaths.comments(projectId, reviewId, threadRef.id)));
        const batch = writeBatch(db());
        batch.set(threadRef, thread);
        batch.set(commentRef, comment(body));
        await batch.commit();
        void sendNotifications(otherSide(), {
          type: 'thread_created',
          projectId,
          reviewId,
          threadId: threadRef.id,
          title: t('Novo comentário: {review}', { review: label() }),
          body: firstLine(body),
        });
        return { threadId: threadRef.id, commentId: commentRef.id };
      },

      /** "Manter só o desenho": thread sem comentário (sem cartão), que aparece no PDF e pode ser apagada. */
      createDrawing: async (documentId: string, annotation: Extract<NewAnnotation, { kind: 'pin' }>, sourceHint: SourceLocation | null) => {
        if (!review || !annotation.drawing) return null;
        const user = currentUser();
        const threadRef = doc(collection(db(), firestorePaths.threads(projectId, reviewId)));
        const thread: Omit<ThreadDoc, 'createdAt' | 'updatedAt' | 'lastCommentAt'> & Record<'createdAt' | 'updatedAt' | 'lastCommentAt', unknown> = {
          projectId,
          reviewId,
          snapshotId: review.snapshotId,
          documentId,
          kind: 'pin',
          anchor: anchorOf(annotation),
          status: 'open',
          resolution: null,
          sourceHint,
          carriedFromThreadId: null,
          drawingOnly: true,
          createdBy: user.uid,
          authorKey: nameGuest?.key ?? null,
          createdByRole: role,
          commentCount: 0,
          participantIds: [user.uid],
          lastCommentAt: null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        await writeBatch(db()).set(threadRef, thread).commit();
        return threadRef.id;
      },

      reply: async (thread: ThreadSummary, body: string) => {
        const user = currentUser();
        const commentRef = doc(collection(db(), firestorePaths.comments(projectId, reviewId, thread.id)));
        const batch = writeBatch(db());
        batch.set(commentRef, comment(body));
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
        return commentRef.id;
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
       * Marcação nova para a mesma thread: o pin arrastado (com o desenho), a marcação refeita
       * (outro ponto, desenho ou trecho) ou a anterior, ao desfazer. A thread desatualizada volta a aberta.
       */
      setMarking: async (thread: ThreadSummary, marking: ThreadMarking) => {
        currentUser();
        await updateDoc(doc(db(), firestorePaths.thread(projectId, reviewId, thread.id)), {
          kind: marking.kind,
          anchor: marking.anchor,
          sourceHint: marking.sourceHint,
          // Só a desatualizada muda de status: gravar o status lido antes desfaria uma resolução feita nesse meio-tempo.
          ...(thread.status === 'outdated' ? { status: 'open' } : {}),
          updatedAt: serverTimestamp(),
        });
      },

      /** Exclui a thread sem apagar nada (exclusão lógica): a marcação e a conversa somem e voltam ao desfazer. */
      deleteThread: async (thread: Pick<ThreadSummary, 'id'>) => {
        currentUser();
        await updateDoc(doc(db(), firestorePaths.thread(projectId, reviewId, thread.id)), { deletedAt: serverTimestamp(), updatedAt: serverTimestamp() });
      },

      /** Desfaz a exclusão da thread. */
      restoreThread: async (thread: Pick<ThreadSummary, 'id'>) => {
        currentUser();
        await updateDoc(doc(db(), firestorePaths.thread(projectId, reviewId, thread.id)), { deletedAt: null, updatedAt: serverTimestamp() });
      },

      /** O autor corrige o texto do próprio comentário (ou volta o texto anterior, ao desfazer). */
      editComment: async (thread: Pick<ThreadSummary, 'id'>, commentId: string, body: string) => {
        currentUser();
        await updateDoc(doc(db(), firestorePaths.comment(projectId, reviewId, thread.id, commentId)), { body, editedAt: serverTimestamp() });
      },

      /** O autor exclui a própria resposta: o registro fica na conversa, sem o texto. */
      deleteComment: async (thread: Pick<ThreadSummary, 'id'>, commentId: string) => {
        currentUser();
        await updateDoc(doc(db(), firestorePaths.comment(projectId, reviewId, thread.id, commentId)), { body: '', deletedAt: serverTimestamp() });
      },

      /** Desfaz a exclusão (ou o envio) de uma resposta: o texto volta. */
      restoreComment: async (thread: Pick<ThreadSummary, 'id'>, commentId: string, body: string) => {
        currentUser();
        await updateDoc(doc(db(), firestorePaths.comment(projectId, reviewId, thread.id, commentId)), { body, deletedAt: null });
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
