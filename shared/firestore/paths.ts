/**
 * Construtores de caminhos do Firestore. Binários também moram no Firestore,
 * divididos em pedaços (ver src/lib/stored-files/chunks.ts).
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
  notification: (uid: UserId, notificationId: string) => `users/${uid}/notifications/${notificationId}`,
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
  /**
   * Arquivos gerados no congelamento ({documentId}.pdf, .synctex, .pages):
   * gravados antes do documento do snapshot e imutáveis depois.
   */
  snapshotFile: (projectId: ProjectId, snapshotId: SnapshotId, fileName: string) =>
    `projects/${projectId}/snapshots/${snapshotId}/files/${fileName}`,
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
  /** O PDF do diff fica nos pedaços deste mesmo documento (campo `pdf`). */
  diff: (projectId: ProjectId, diffKey: string) => `projects/${projectId}/diffs/${diffKey}`,
  /** Conteúdo endereçado por hash: imutável e deduplicado entre versões. */
  blob: (projectId: ProjectId, sha256: string) => `projects/${projectId}/blobs/${sha256}`,
  /** Pedaços de um arquivo guardado: blob, arquivo de versão ou diff. */
  chunks: (parentPath: string) => `${parentPath}/chunks`,
  chunk: (parentPath: string, index: number) => `${parentPath}/chunks/${index}`,
  aiConversations: (projectId: ProjectId) => `projects/${projectId}/aiConversations`,
  aiConversation: (projectId: ProjectId, conversationId: string) =>
    `projects/${projectId}/aiConversations/${conversationId}`,
  aiMessages: (projectId: ProjectId, conversationId: string) =>
    `projects/${projectId}/aiConversations/${conversationId}/messages`,
  referenceChecks: (projectId: ProjectId) => `projects/${projectId}/referenceChecks`,
} as const;

export type SnapshotFileKind = 'pdf' | 'synctex' | 'pages';

/** Nome do arquivo de versão: o documento vem antes do ponto (as regras dependem disso). */
export function snapshotFileName(documentId: DocumentId, kind: SnapshotFileKind): string {
  return `${documentId}.${kind}`;
}
