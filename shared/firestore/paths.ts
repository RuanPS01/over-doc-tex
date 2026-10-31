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
  userAiConfig: (uid: UserId) => `users/${uid}/private/ai`,
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
  /** O id do grant é o e-mail do revisor em minúsculas. */
  snapshotGrant: (projectId: ProjectId, snapshotId: SnapshotId, email: string) =>
    `projects/${projectId}/snapshots/${snapshotId}/grants/${email.toLowerCase()}`,
  reviews: (projectId: ProjectId) => `projects/${projectId}/reviews`,
  review: (projectId: ProjectId, reviewId: ReviewId) => `projects/${projectId}/reviews/${reviewId}`,
  threads: (projectId: ProjectId, reviewId: ReviewId) =>
    `projects/${projectId}/reviews/${reviewId}/threads`,
  thread: (projectId: ProjectId, reviewId: ReviewId, threadId: ThreadId) =>
    `projects/${projectId}/reviews/${reviewId}/threads/${threadId}`,
  comments: (projectId: ProjectId, reviewId: ReviewId, threadId: ThreadId) =>
    `projects/${projectId}/reviews/${reviewId}/threads/${threadId}/comments`,
  diff: (projectId: ProjectId, diffKey: string) => `projects/${projectId}/diffs/${diffKey}`,
  aiConversations: (projectId: ProjectId) => `projects/${projectId}/aiConversations`,
  aiConversation: (projectId: ProjectId, conversationId: string) =>
    `projects/${projectId}/aiConversations/${conversationId}`,
  aiMessages: (projectId: ProjectId, conversationId: string) =>
    `projects/${projectId}/aiConversations/${conversationId}/messages`,
  referenceChecks: (projectId: ProjectId) => `projects/${projectId}/referenceChecks`,
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
  /** Fica sob a versão alvo: quem pode ler a versão pode ler o diff dela. */
  diffPdf: (
    projectId: ProjectId,
    targetSnapshotId: SnapshotId,
    baseSnapshotId: SnapshotId,
    documentId: DocumentId,
    engineVersion: string,
  ) => `projects/${projectId}/snapshots/${targetSnapshotId}/diffs/${baseSnapshotId}/${documentId}/${engineVersion}.pdf`,
} as const;
