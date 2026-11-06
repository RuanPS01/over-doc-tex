import { useMemo } from 'react';
import type { SourceLocation } from '@shared/firestore/types';
import { useUndoStack } from '@/hooks/use-undo-stack';
import { t } from '@/lib/i18n';
import { markingOf, type NewAnnotation, type ThreadMarking, type useReviewActions } from './use-review-actions';
import type { ThreadSummary } from '../model/review';

type ReviewActions = ReturnType<typeof useReviewActions>;

/**
 * As ações da revisão que dá para desfazer (botões e Ctrl+Z), cada uma com o
 * caminho de volta gravado no Firestore pelo próprio usuário, como as regras
 * permitem: comentário novo e desenho saem e voltam pela exclusão lógica;
 * resposta, edição e exclusão de resposta pelo texto; marcação pela anterior;
 * resolver e reabrir pelo status anterior.
 */
export function useReviewHistory(actions: ReviewActions) {
  const history = useUndoStack();
  const { push } = history;

  const undoable = useMemo(
    () => ({
      createThread: async (documentId: string, annotation: NewAnnotation, body: string, sourceHint: SourceLocation | null) => {
        const created = await actions.createThread(documentId, annotation, body, sourceHint);
        if (created) {
          const thread = { id: created.threadId };
          push({ label: t('comentário novo'), undo: () => actions.deleteThread(thread), redo: () => actions.restoreThread(thread) });
        }
        return created;
      },

      createDrawing: async (documentId: string, annotation: Extract<NewAnnotation, { kind: 'pin' }>, sourceHint: SourceLocation | null) => {
        const threadId = await actions.createDrawing(documentId, annotation, sourceHint);
        if (threadId) {
          const thread = { id: threadId };
          push({ label: t('desenho'), undo: () => actions.deleteThread(thread), redo: () => actions.restoreThread(thread) });
        }
        return threadId;
      },

      reply: async (thread: ThreadSummary, body: string) => {
        const commentId = await actions.reply(thread, body);
        push({ label: t('resposta'), undo: () => actions.deleteComment(thread, commentId), redo: () => actions.restoreComment(thread, commentId, body) });
      },

      editComment: async (thread: ThreadSummary, commentId: string, body: string, previous: string) => {
        await actions.editComment(thread, commentId, body);
        push({ label: t('edição do comentário'), undo: () => actions.editComment(thread, commentId, previous), redo: () => actions.editComment(thread, commentId, body) });
      },

      deleteComment: async (thread: ThreadSummary, commentId: string, body: string) => {
        await actions.deleteComment(thread, commentId);
        push({ label: t('resposta excluída'), undo: () => actions.restoreComment(thread, commentId, body), redo: () => actions.deleteComment(thread, commentId) });
      },

      deleteThread: async (thread: ThreadSummary) => {
        await actions.deleteThread(thread);
        push({
          label: thread.drawingOnly ? t('desenho apagado') : t('comentário excluído'),
          undo: () => actions.restoreThread(thread),
          redo: () => actions.deleteThread(thread),
        });
      },

      setMarking: async (thread: ThreadSummary, marking: ThreadMarking) => {
        const previous = markingOf(thread);
        await actions.setMarking(thread, marking);
        push({ label: t('marcação no PDF'), undo: () => actions.setMarking(thread, previous), redo: () => actions.setMarking(thread, marking) });
      },

      setThreadStatus: async (thread: ThreadSummary, status: 'open' | 'resolved') => {
        const previous = thread.status === 'resolved' ? 'resolved' : 'open';
        await actions.setThreadStatus(thread, status);
        push({
          label: status === 'resolved' ? t('comentário resolvido') : t('comentário reaberto'),
          undo: () => actions.setThreadStatus(thread, previous),
          redo: () => actions.setThreadStatus(thread, status),
        });
      },
    }),
    [actions, push],
  );

  return { ...undoable, history };
}
