import type { ReviewDoc, ReviewStatus, ThreadDoc, CommentDoc } from '@shared/firestore/types';

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  invited: 'Aguardando o revisor',
  in_review: 'Em revisão',
  changes_requested: 'Alterações pedidas',
  approved: 'Aprovada',
  closed: 'Encerrada',
};

export const MAX_COMMENT_LENGTH = 10_000;

/** Revisão como a interface usa: datas convertidas e id junto. */
export interface ReviewSummary extends Omit<ReviewDoc, 'requestedAt' | 'lastActivityAt' | 'closedAt'> {
  id: string;
  projectId: string;
  requestedAt: Date | null;
  lastActivityAt: Date | null;
}

export function toReviewSummary(projectId: string, id: string, data: ReviewDoc): ReviewSummary {
  const { requestedAt, lastActivityAt, closedAt: _closedAt, ...rest } = data;
  return { ...rest, id, projectId, requestedAt: requestedAt?.toDate() ?? null, lastActivityAt: lastActivityAt?.toDate() ?? null };
}

export interface ThreadSummary extends Omit<ThreadDoc, 'createdAt' | 'updatedAt' | 'lastCommentAt' | 'resolution'> {
  id: string;
  resolution: { kind: NonNullable<ThreadDoc['resolution']>['kind']; by: string; fixedInSnapshotId: string | null } | null;
  createdAt: Date | null;
}

export function toThreadSummary(id: string, data: ThreadDoc): ThreadSummary {
  const { createdAt, updatedAt: _updatedAt, lastCommentAt: _lastCommentAt, resolution, ...rest } = data;
  return {
    ...rest,
    id,
    resolution: resolution ? { kind: resolution.kind, by: resolution.by, fixedInSnapshotId: resolution.fixedInSnapshotId ?? null } : null,
    createdAt: createdAt?.toDate() ?? null,
  };
}

export interface CommentSummary extends Omit<CommentDoc, 'createdAt' | 'editedAt' | 'deletedAt'> {
  id: string;
  createdAt: Date | null;
}

export function toCommentSummary(id: string, data: CommentDoc): CommentSummary {
  const { createdAt, editedAt: _editedAt, deletedAt: _deletedAt, ...rest } = data;
  return { ...rest, id, createdAt: createdAt?.toDate() ?? null };
}

/** Ordem de leitura dos pins: página, depois de cima para baixo. */
export function sortThreads(threads: readonly ThreadSummary[]): ThreadSummary[] {
  const position = (thread: ThreadSummary) => (thread.anchor.type === 'pin' ? thread.anchor.point.y : (thread.anchor.rects[0]?.y ?? 0));
  return [...threads].sort((a, b) => a.anchor.page - b.anchor.page || position(a) - position(b));
}

/** Rota da revisão (sem o subcaminho do site). */
export function reviewPath(projectId: string, reviewId: string): string {
  return `/p/${projectId}/reviews/${reviewId}`;
}
