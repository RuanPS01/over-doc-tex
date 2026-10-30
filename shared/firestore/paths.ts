/**
 * Construtores de caminhos do Firestore e do Storage.
 * Nenhum caminho deve ser montado com template string fora deste arquivo.
 */
import type {
  DocumentId,
  FileId,
  ProjectId,
  ReviewId,
  SnapshotId,
  ThreadId,
  UserId,
} from './types';

export const firestorePaths = {
  user: (uid: UserId) => `users/${uid}`,
  notifications: (uid: UserId) => `users/${uid}/notifications`,
  projects: () => 'projects',
  project: (projectId: ProjectId) => `projects/${projectId}`,
  files: (projectId: ProjectId) => `projects/${projectId}/files`,
  file: (projectId: ProjectId, fileId: FileId) => `projects/${projectId}/files/${fileId}`,
  documents: (projectId: ProjectId) => `projects/${projectId}/documents`,
  document: (projectId: ProjectId, documentId: DocumentId) =>
    `projects/${projectId}/documents/${documentId}`,
  snapshots: (projectId: ProjectId) => `projects/${projectId}/snapshots`,
  snapshot: (projectId: ProjectId, snapshotId: SnapshotId) =>
    `projects/${projectId}/snapshots/${snapshotId}`,
  snapshotGrant: (projectId: ProjectId, snapshotId: SnapshotId, uid: UserId) =>
    `projects/${projectId}/snapshots/${snapshotId}/grants/${uid}`,
  reviews: (projectId: ProjectId) => `projects/${projectId}/reviews`,
  review: (projectId: ProjectId, reviewId: ReviewId) => `projects/${projectId}/reviews/${reviewId}`,
  threads: (projectId: ProjectId, reviewId: ReviewId) =>
    `projects/${projectId}/reviews/${reviewId}/threads`,
  thread: (projectId: ProjectId, reviewId: ReviewId, threadId: ThreadId) =>
    `projects/${projectId}/reviews/${reviewId}/threads/${threadId}`,
  comments: (projectId: ProjectId, reviewId: ReviewId, threadId: ThreadId) =>
    `projects/${projectId}/reviews/${reviewId}/threads/${threadId}/comments`,
  diffJob: (projectId: ProjectId, diffKey: string) => `projects/${projectId}/diffJobs/${diffKey}`,
  job: (projectId: ProjectId, jobId: string) => `projects/${projectId}/jobs/${jobId}`,
  aiConversations: (projectId: ProjectId) => `projects/${projectId}/aiConversations`,
  aiConversation: (projectId: ProjectId, conversationId: string) =>
    `projects/${projectId}/aiConversations/${conversationId}`,
  aiMessages: (projectId: ProjectId, conversationId: string) =>
    `projects/${projectId}/aiConversations/${conversationId}/messages`,
  referenceChecks: (projectId: ProjectId) => `projects/${projectId}/referenceChecks`,
  invite: (inviteId: string) => `invites/${inviteId}`,
  mail: () => 'mail',
} as const;

export const storagePaths = {
  /** Conteúdo endereçado por hash: imutável e deduplicado entre snapshots. */
  blob: (projectId: ProjectId, sha256: string) => `projects/${projectId}/blobs/${sha256}`,
  /** Última compilação de trabalho (sobrescrita a cada build). */
  buildPdf: (projectId: ProjectId, documentId: DocumentId) =>
    `projects/${projectId}/builds/${documentId}/latest.pdf`,
  buildLog: (projectId: ProjectId, documentId: DocumentId) =>
    `projects/${projectId}/builds/${documentId}/latest.log`,
  snapshotPdf: (projectId: ProjectId, snapshotId: SnapshotId, documentId: DocumentId) =>
    `projects/${projectId}/snapshots/${snapshotId}/${documentId}.pdf`,
  snapshotSynctex: (projectId: ProjectId, snapshotId: SnapshotId, documentId: DocumentId) =>
    `projects/${projectId}/snapshots/${snapshotId}/${documentId}.synctex.gz`,
  snapshotPageText: (projectId: ProjectId, snapshotId: SnapshotId, documentId: DocumentId) =>
    `projects/${projectId}/snapshots/${snapshotId}/${documentId}.pages.json`,
  diffPdf: (projectId: ProjectId, diffKey: string) => `projects/${projectId}/diffs/${diffKey}.pdf`,
  diffLog: (projectId: ProjectId, diffKey: string) => `projects/${projectId}/diffs/${diffKey}.log`,
} as const;
