import type { AnnotationColor, CommentDoc, NormalizedPoint, ReviewAccess, ReviewDoc, ReviewStatus, Stroke, TextAnchor, ThreadDoc } from '@shared/firestore/types';
import { msg, t } from '@/lib/i18n';

/** Rótulos são chaves de tradução (msg): quem mostra chama t(). */
export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  invited: msg('Aguardando o revisor'),
  in_review: msg('Em revisão'),
  changes_requested: msg('Alterações pedidas'),
  approved: msg('Aprovada'),
  closed: msg('Encerrada'),
};

export const MAX_COMMENT_LENGTH = 10_000;

/** Revisão como a interface usa: datas convertidas, id junto e campos novos preenchidos. */
export interface ReviewSummary extends Omit<ReviewDoc, 'requestedAt' | 'lastActivityAt' | 'closedAt' | 'access' | 'reviewerEmails'> {
  id: string;
  projectId: string;
  requestedAt: Date | null;
  lastActivityAt: Date | null;
  access: ReviewAccess;
  /** Todos os e-mails convidados (o da criação e os acrescentados). */
  reviewerEmails: string[];
}

export function toReviewSummary(projectId: string, id: string, data: ReviewDoc): ReviewSummary {
  const { requestedAt, lastActivityAt, closedAt: _closedAt, access, reviewerEmails, ...rest } = data;
  const emails = [...new Set([data.reviewerEmail, ...(reviewerEmails ?? [])].filter(Boolean))];
  return {
    ...rest,
    id,
    projectId,
    requestedAt: requestedAt?.toDate() ?? null,
    lastActivityAt: lastActivityAt?.toDate() ?? null,
    access: access ?? 'email',
    reviewerEmails: emails,
  };
}

/** Quem revisa, para listas e cabeçalhos: o nome de quem agiu, os e-mails ou "pelo link". */
export function reviewerLabel(review: Pick<ReviewSummary, 'reviewerName' | 'reviewerEmails' | 'access'>): string {
  if (review.reviewerName) return review.reviewerName;
  if (review.reviewerEmails.length > 0) return review.reviewerEmails.length === 1 ? review.reviewerEmails[0]! : `${review.reviewerEmails[0]} +${review.reviewerEmails.length - 1}`;
  return review.access === 'link' ? t('Revisão pelo link') : '';
}

/**
 * Identidade do revisor pelo link: o nome sem acentos, em minúsculas, com os
 * espaços normalizados. "Maria  Souza" e "maria souza" são a mesma pessoa.
 */
export function guestKeyOf(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .slice(0, 80);
}

/**
 * Identidade de quem entrou pelo link com a própria conta: "uid:" e o id da
 * conta. O ":" nunca sai de guestKeyOf, então nenhum nome digitado chega nela,
 * e as regras só aceitam "uid:" seguido do próprio id.
 */
export function accountGuestKey(uid: string): string {
  return `uid:${uid}`;
}

/** Código secreto do link (24 bytes aleatórios, em base64url: 32 caracteres). */
export function newLinkToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Endereço completo do link de revisão sem conta (leva o código e a versão). */
export function reviewLinkUrl(origin: string, base: string, review: Pick<ReviewSummary, 'projectId' | 'id' | 'snapshotId'>, token: string): string {
  const path = `${base.replace(/\/$/, '')}${reviewPath(review.projectId, review.id)}`;
  return `${origin}${path}?k=${encodeURIComponent(token)}&v=${encodeURIComponent(review.snapshotId)}`;
}

/** E-mails de um campo livre (vírgula, ponto e vírgula, espaço ou linha), válidos e sem repetição. */
export function parseEmails(text: string): { valid: string[]; invalid: string[] } {
  const parts = text.split(/[\s,;]+/).map((part) => part.trim().toLowerCase()).filter(Boolean);
  const valid = [...new Set(parts.filter((part) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(part)))];
  return { valid, invalid: parts.filter((part) => !valid.includes(part)) };
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
  'annotation-1': msg('Amarelo'),
  'annotation-2': msg('Vermelho'),
  'annotation-3': msg('Azul'),
  'annotation-4': msg('Verde'),
};

/** Página e ponto de referência de qualquer âncora (para ordenar e rolar até ela). */
export function anchorPoint(thread: Pick<ThreadSummary, 'anchor'>): { page: number; x: number; y: number } {
  const { anchor } = thread;
  if (anchor.type === 'pin') return { page: anchor.page, x: anchor.point.x, y: anchor.point.y };
  const first = anchor.rects[0];
  return { page: anchor.page, x: first?.x ?? 0, y: first?.y ?? 0 };
}
