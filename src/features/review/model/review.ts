import type { AnnotationColor, CommentDoc, NormalizedPoint, ReviewDoc, ReviewStatus, Stroke, TextAnchor, ThreadDoc } from '@shared/firestore/types';

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

/** Ordem de leitura: documento, página, depois de cima para baixo. */
export function sortThreads(threads: readonly ThreadSummary[]): ThreadSummary[] {
  return [...threads].sort(
    (a, b) => a.documentId.localeCompare(b.documentId) || a.anchor.page - b.anchor.page || anchorPoint(a).y - anchorPoint(b).y,
  );
}

/** Rota da revisão (sem o subcaminho do site). */
export function reviewPath(projectId: string, reviewId: string): string {
  return `/p/${projectId}/reviews/${reviewId}`;
}

/** Ferramenta ativa sobre o PDF: selecionar texto (padrão), marcar um ponto ou desenhar. */
export type ReviewTool = 'select' | 'pin' | 'draw';

/** Marcação ainda sem comentário, esperando o texto no painel lateral. */
export type PendingAnnotation =
  | { kind: 'pin'; page: number; point: NormalizedPoint }
  | { kind: 'text'; anchor: TextAnchor }
  | { kind: 'draw'; page: number; strokes: Stroke[]; color: AnnotationColor };

export const ANNOTATION_COLORS: AnnotationColor[] = ['annotation-2', 'annotation-3', 'annotation-4', 'annotation-1'];

export const ANNOTATION_COLOR_LABELS: Record<AnnotationColor, string> = {
  'annotation-1': 'Amarelo',
  'annotation-2': 'Vermelho',
  'annotation-3': 'Azul',
  'annotation-4': 'Verde',
};

/** Página e ponto de referência de qualquer âncora (para ordenar e rolar até ela). */
export function anchorPoint(thread: Pick<ThreadSummary, 'anchor'>): { page: number; x: number; y: number } {
  const { anchor } = thread;
  if (anchor.type === 'pin') return { page: anchor.page, x: anchor.point.x, y: anchor.point.y };
  const first = anchor.rects[0];
  return { page: anchor.page, x: first?.x ?? 0, y: first?.y ?? 0 };
}
