/**
 * Modelo de dados do Firestore (fonte única da verdade).
 *
 * Compartilhado entre o frontend (firebase/firestore) e o backend
 * (firebase-admin/firestore). Por isso nenhum tipo aqui importa SDK:
 * datas usam `TimestampLike`, que os dois SDKs satisfazem estruturalmente.
 *
 * Mapa de coleções (detalhado em docs/06-banco-de-dados.md):
 *
 *   users/{uid}
 *   users/{uid}/notifications/{notificationId}
 *   projects/{projectId}
 *   projects/{projectId}/files/{fileId}
 *   projects/{projectId}/documents/{documentId}
 *   projects/{projectId}/snapshots/{snapshotId}                 (imutável)
 *   projects/{projectId}/snapshots/{snapshotId}/grants/{uid}    (acesso do revisor)
 *   projects/{projectId}/reviews/{reviewId}
 *   projects/{projectId}/reviews/{reviewId}/threads/{threadId}
 *   projects/{projectId}/reviews/{reviewId}/threads/{threadId}/comments/{commentId}
 *   projects/{projectId}/diffJobs/{diffKey}
 *   projects/{projectId}/jobs/{jobId}
 *   projects/{projectId}/aiConversations/{conversationId}
 *   projects/{projectId}/aiConversations/{conversationId}/messages/{messageId}
 *   projects/{projectId}/referenceChecks/{checkId}
 *   invites/{inviteId}                                          (somente servidor)
 *   mail/{mailId}                                               (extensão Trigger Email)
 */

/** Timestamp compatível com os SDKs web e Admin. */
export interface TimestampLike {
  toDate(): Date;
  toMillis(): number;
}

// Identificadores nomeados apenas para legibilidade das assinaturas.
export type UserId = string;
export type ProjectId = string;
export type FileId = string;
export type DocumentId = string;
export type SnapshotId = string;
export type ReviewId = string;
export type ThreadId = string;
export type CommentId = string;

// ---------------------------------------------------------------------------
// Enumerações (uniões de literais, nunca `enum` do TypeScript)
// ---------------------------------------------------------------------------

export type ProjectRole = 'owner' | 'editor' | 'viewer';
export type LatexEngine = 'pdflatex' | 'xelatex' | 'lualatex';
export type FileKind = 'folder' | 'tex' | 'bib' | 'sty' | 'cls' | 'image' | 'pdf' | 'data' | 'other';
export type DocumentRole = 'main' | 'secondary';
export type BuildStatus = 'idle' | 'running' | 'ok' | 'error';
export type ReviewStatus = 'invited' | 'in_review' | 'changes_requested' | 'approved' | 'closed';
export type ParticipantRole = 'author' | 'reviewer';
export type ThreadKind = 'text' | 'pin';
export type ThreadStatus = 'open' | 'resolved' | 'wont_fix' | 'outdated';
export type ResolutionKind = 'fixed_next_version' | 'answered' | 'not_applicable';
export type CommentKind = 'comment' | 'status_change' | 'system';
/** Cores de anotação como tokens semânticos (ver docs/03-identidade-visual.md). */
export type AnnotationColor = 'annotation-1' | 'annotation-2' | 'annotation-3' | 'annotation-4';
export type JobStatus = 'queued' | 'running' | 'done' | 'failed';
export type DiffGranularity = 'word' | 'paragraph' | 'text-only';
export type NotificationType =
  | 'review_requested'
  | 'review_status_changed'
  | 'thread_created'
  | 'comment_added'
  | 'thread_resolved'
  | 'diff_ready';

// ---------------------------------------------------------------------------
// users/{uid}
// ---------------------------------------------------------------------------

export interface UserDoc {
  displayName: string;
  /** Sempre em minúsculas, usado para casar convites de revisão. */
  email: string;
  photoURL: string | null;
  providerIds: Array<'google.com' | 'password'>;
  preferences: {
    theme: 'system' | 'light' | 'dark';
    editorFontSize: number;
    locale: 'pt-BR';
  };
  createdAt: TimestampLike;
  lastSeenAt: TimestampLike;
}

// users/{uid}/notifications/{notificationId}
export interface NotificationDoc {
  type: NotificationType;
  projectId: ProjectId;
  reviewId: ReviewId | null;
  threadId: ThreadId | null;
  actorId: UserId;
  title: string;
  body: string;
  read: boolean;
  createdAt: TimestampLike;
}

// ---------------------------------------------------------------------------
// projects/{projectId}
// ---------------------------------------------------------------------------

export interface ProjectDoc {
  name: string;
  description: string | null;
  ownerId: UserId;
  /** Mapa uid para papel. Fonte da verdade usada pelas regras de segurança. */
  members: Record<UserId, ProjectRole>;
  /** Espelho das chaves de `members` para consultas `array-contains`. */
  memberIds: UserId[];
  engine: LatexEngine;
  mainDocumentId: DocumentId;
  latestSnapshotId: SnapshotId | null;
  /** Contador monotônico usado para gerar rótulos de versão e números de revisão. */
  counters: { snapshots: number; reviews: number };
  stats: { fileCount: number; totalBytes: number };
  createdAt: TimestampLike;
  updatedAt: TimestampLike;
  archivedAt: TimestampLike | null;
}

// projects/{projectId}/files/{fileId}
// Um nó da árvore de arquivos (pasta, .tex, .bib, imagem...).
export interface FileDoc {
  name: string;
  /** Caminho normalizado relativo à raiz do projeto, ex.: "capitulos/introducao.tex". */
  path: string;
  parentId: FileId | null;
  kind: FileKind;
  /** Conteúdo inline para arquivos de texto até 512 KiB (limite do documento: 1 MiB). */
  content: string | null;
  /** Binários e textos grandes: "projects/{projectId}/blobs/{sha256}" no Storage. */
  blobPath: string | null;
  /** sha256 hexadecimal do conteúdo; nulo para pastas. */
  contentHash: string | null;
  size: number;
  /** Incrementado a cada gravação; usado para concorrência otimista no autosave. */
  revision: number;
  updatedAt: TimestampLike;
  updatedBy: UserId;
}

// projects/{projectId}/documents/{documentId}
// Um documento compilável (ponto de entrada .tex que gera um PDF próprio).
export interface DocumentDoc {
  title: string;
  /** O revisor vê o "main" por padrão; "secondary" depende de concessão explícita. */
  role: DocumentRole;
  rootFileId: FileId;
  rootPath: string;
  /** Nulo herda o motor do projeto. */
  engine: LatexEngine | null;
  order: number;
  /** Última compilação de trabalho (mutável, escrita só pelo servidor). */
  lastBuild: {
    status: BuildStatus;
    pdfPath: string | null;
    logPath: string | null;
    sourceHash: string;
    durationMs: number | null;
    finishedAt: TimestampLike | null;
  } | null;
  createdAt: TimestampLike;
  updatedAt: TimestampLike;
}

// ---------------------------------------------------------------------------
// Snapshots (versões congeladas)
// ---------------------------------------------------------------------------

export interface SnapshotFileEntry {
  path: string;
  /** sha256; o conteúdo vive em "projects/{projectId}/blobs/{hash}" (deduplicado). */
  hash: string;
  size: number;
  kind: FileKind;
}

export interface SnapshotRender {
  title: string;
  role: DocumentRole;
  rootPath: string;
  /** "projects/{projectId}/snapshots/{snapshotId}/{documentId}.pdf" */
  pdfPath: string;
  pdfSha256: string;
  pageCount: number;
  /** Dados SyncTeX para mapear PDF e código-fonte. */
  synctexPath: string | null;
  /** JSON com o texto extraído por página, usado para ancorar e reancorar comentários. */
  pageTextPath: string | null;
}

// projects/{projectId}/snapshots/{snapshotId}
// Escrito UMA vez pela Cloud Function `createSnapshot`, depois da compilação.
// As regras negam qualquer update/delete: o snapshot é imutável.
export interface SnapshotDoc {
  /** Rótulo legível, ex.: "1.0", "1.1". */
  label: string;
  version: { major: number; minor: number };
  sequence: number;
  parentSnapshotId: SnapshotId | null;
  message: string | null;
  engine: LatexEngine;
  /** Manifesto completo da árvore no momento do congelamento. */
  files: SnapshotFileEntry[];
  /** sha256 do manifesto ordenado; compõe a chave de cache do diff. */
  sourceHash: string;
  documents: Record<DocumentId, SnapshotRender>;
  stats: { words: number; pages: number };
  createdBy: UserId;
  createdAt: TimestampLike;
}

// projects/{projectId}/snapshots/{snapshotId}/grants/{uid}
// Existência deste documento libera leitura do snapshot para um não membro.
export interface SnapshotGrantDoc {
  /** Documentos visíveis ao revisor; sempre contém o documento principal. */
  documentIds: DocumentId[];
  reviewIds: ReviewId[];
  grantedBy: UserId;
  grantedAt: TimestampLike;
  expiresAt: TimestampLike | null;
}

// ---------------------------------------------------------------------------
// Revisões (fila de revisão estilo Pull Request)
// ---------------------------------------------------------------------------

// projects/{projectId}/reviews/{reviewId}
export interface ReviewDoc {
  /** Número sequencial exibido como "#3", à semelhança de um PR. */
  number: number;
  title: string;
  description: string | null;
  /** Denormalizado para o revisor, que não lê o documento do projeto. */
  projectName: string;
  snapshotId: SnapshotId;
  snapshotLabel: string;
  /** Versão anterior usada como base do diff; nulo na primeira rodada. */
  baseSnapshotId: SnapshotId | null;
  previousReviewId: ReviewId | null;
  requestedBy: UserId;
  requestedAt: TimestampLike;
  reviewerEmail: string;
  reviewerUid: UserId | null;
  reviewerName: string | null;
  status: ReviewStatus;
  grantedDocumentIds: DocumentId[];
  threadCounts: { open: number; resolved: number; total: number };
  lastActivityAt: TimestampLike;
  closedAt: TimestampLike | null;
}

/** Retângulo normalizado (0..1) relativo à página; origem no canto superior esquerdo. */
export interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NormalizedPoint {
  x: number;
  y: number;
}

/**
 * Âncora de texto selecionado no PDF. Combina três seletores para resistir a
 * mudanças: geometria (rects), citação (quote, no estilo W3C TextQuoteSelector)
 * e posição no texto da página (position).
 */
export interface TextAnchor {
  type: 'text';
  /** Página com base 1. */
  page: number;
  rects: NormalizedRect[];
  quote: { exact: string; prefix: string; suffix: string };
  /** Deslocamentos no texto concatenado da página (pdf.js textContent). */
  position: { start: number; end: number };
}

export interface Stroke {
  tool: 'pen' | 'highlighter';
  color: AnnotationColor;
  /** Espessura como fração da largura da página. */
  width: number;
  /**
   * Pontos achatados [x0, y0, x1, y1, ...] normalizados.
   * O Firestore não aceita arrays diretamente aninhados, por isso não usamos [[x, y]].
   * Os traços são simplificados (Ramer-Douglas-Peucker) antes de gravar.
   */
  points: number[];
}

export interface Drawing {
  strokes: Stroke[];
  bounds: NormalizedRect;
}

/** Pin espacial flutuante, opcionalmente atrelado a um desenho livre. */
export interface PinAnchor {
  type: 'pin';
  page: number;
  point: NormalizedPoint;
  drawing: Drawing | null;
}

export type ThreadAnchor = TextAnchor | PinAnchor;

/** Posição no código-fonte obtida via SyncTeX. */
export interface SourceLocation {
  path: string;
  line: number;
  column: number | null;
}

// projects/{projectId}/reviews/{reviewId}/threads/{threadId}
export interface ThreadDoc {
  /** Denormalizados para consultas collectionGroup e validação nas regras. */
  projectId: ProjectId;
  reviewId: ReviewId;
  snapshotId: SnapshotId;
  documentId: DocumentId;
  kind: ThreadKind;
  anchor: ThreadAnchor;
  status: ThreadStatus;
  resolution: {
    kind: ResolutionKind;
    by: UserId;
    at: TimestampLike;
    /** Preenchido pela função `createSnapshot` ao congelar a próxima versão. */
    fixedInSnapshotId: SnapshotId | null;
  } | null;
  sourceHint: SourceLocation | null;
  /** Thread herdada de uma rodada anterior ainda aberta. */
  carriedFromThreadId: ThreadId | null;
  createdBy: UserId;
  createdByRole: ParticipantRole;
  /** Mantidos por trigger no servidor. */
  commentCount: number;
  participantIds: UserId[];
  lastCommentAt: TimestampLike | null;
  createdAt: TimestampLike;
  updatedAt: TimestampLike;
}

// projects/{projectId}/reviews/{reviewId}/threads/{threadId}/comments/{commentId}
export interface CommentDoc {
  authorId: UserId;
  authorName: string;
  authorPhotoURL: string | null;
  authorRole: ParticipantRole;
  kind: CommentKind;
  /** Markdown; sanitizado no cliente antes de renderizar. */
  body: string;
  statusChange: { from: ThreadStatus; to: ThreadStatus } | null;
  createdAt: TimestampLike;
  editedAt: TimestampLike | null;
  /** Exclusão lógica: o corpo é apagado, o registro permanece na thread. */
  deletedAt: TimestampLike | null;
}

// ---------------------------------------------------------------------------
// Diff visual e jobs assíncronos
// ---------------------------------------------------------------------------

export interface DiffChangeMarker {
  id: string;
  kind: 'add' | 'del' | 'mod';
  page: number;
  /** Posição vertical normalizada na página, para navegar entre alterações. */
  y: number;
  preview: string;
}

// projects/{projectId}/diffJobs/{diffKey}
// diffKey = sha256(base.sourceHash + target.sourceHash + documentId + engineVersion):
// pedidos repetidos reaproveitam o mesmo job e o mesmo PDF (idempotência).
export interface DiffJobDoc {
  documentId: DocumentId;
  baseSnapshotId: SnapshotId;
  targetSnapshotId: SnapshotId;
  engineVersion: string;
  status: JobStatus;
  /** Nível alcançado na escada de degradação (ver docs/07-fluxos.md). */
  granularity: DiffGranularity | null;
  pdfPath: string | null;
  logPath: string | null;
  stats: { insertedWords: number; deletedWords: number; changedBlocks: number } | null;
  /** Limitado a 500 marcadores para respeitar o tamanho máximo do documento. */
  changes: DiffChangeMarker[];
  error: { code: string; message: string } | null;
  requestedBy: UserId;
  requestedAt: TimestampLike;
  startedAt: TimestampLike | null;
  finishedAt: TimestampLike | null;
}

// projects/{projectId}/jobs/{jobId}
export interface JobDoc {
  type: 'compile' | 'snapshot';
  status: JobStatus;
  documentId: DocumentId | null;
  /** 0..1, atualizado pelo worker. */
  progress: number;
  result: { snapshotId?: SnapshotId; pdfPath?: string } | null;
  error: { code: string; message: string } | null;
  requestedBy: UserId;
  createdAt: TimestampLike;
  updatedAt: TimestampLike;
}

// ---------------------------------------------------------------------------
// Assistente de IA
// ---------------------------------------------------------------------------

export type AiTaskName =
  | 'chat'
  | 'rewriteText'
  | 'paraphrase'
  | 'reorganizeTopics'
  | 'updateToc'
  | 'generateDraft'
  | 'checkReferences';

export interface AiContextRef {
  fileId: FileId;
  path: string;
  startLine: number;
  endLine: number;
}

// projects/{projectId}/aiConversations/{conversationId}  (privada ao criador)
export interface AiConversationDoc {
  title: string;
  createdBy: UserId;
  lastTask: AiTaskName;
  createdAt: TimestampLike;
  updatedAt: TimestampLike;
}

// projects/{projectId}/aiConversations/{conversationId}/messages/{messageId}
// Gravado pelo backend ao fim de cada stream.
export interface AiMessageDoc {
  role: 'user' | 'assistant';
  task: AiTaskName;
  content: string;
  /** Saída estruturada já validada por Zod (quando a tarefa a produz). */
  structured: unknown;
  contextRefs: AiContextRef[];
  usage: { inputTokens: number; outputTokens: number } | null;
  status: 'complete' | 'error' | 'aborted';
  createdAt: TimestampLike;
}

// projects/{projectId}/referenceChecks/{checkId}
export interface ReferenceCheckDoc {
  createdBy: UserId;
  snapshotId: SnapshotId | null;
  /** Mesmo formato de `ReferenceAudit` em shared/ai/schemas.ts. */
  results: Array<{
    key: string;
    url: string | null;
    linkStatus: 'ok' | 'redirected' | 'broken' | 'timeout' | 'blocked' | 'no_url';
    httpStatus: number | null;
    verdict: 'matches' | 'mismatch' | 'unreachable' | 'uncertain';
    explanation: string;
  }>;
  summary: { ok: number; problems: number; uncertain: number };
  createdAt: TimestampLike;
}

// ---------------------------------------------------------------------------
// Coleções de nível raiz acessadas apenas pelo servidor
// ---------------------------------------------------------------------------

// invites/{inviteId}  (inviteId = sha256 do token enviado por e-mail)
export interface InviteDoc {
  projectId: ProjectId;
  reviewId: ReviewId;
  email: string;
  createdBy: UserId;
  createdAt: TimestampLike;
  expiresAt: TimestampLike;
  acceptedAt: TimestampLike | null;
  acceptedBy: UserId | null;
}

// mail/{mailId}  (consumida pela extensão oficial "Trigger Email from Firestore")
export interface MailDoc {
  to: string[];
  message: { subject: string; text: string; html: string };
}
