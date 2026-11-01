/**
 * Modelo de dados do Firestore (fonte única da verdade).
 *
 * Não há servidor: o app grava tudo, e as regras (firestore.rules) validam
 * cada gravação. Nenhum tipo aqui importa SDK: datas usam `TimestampLike`,
 * que o SDK web e o Admin satisfazem estruturalmente (scripts e testes).
 *
 * Mapa de coleções (detalhado em docs/06-banco-de-dados.md):
 *
 *   users/{uid}
 *   users/{uid}/private/ai                                      (configuração da IA, só o dono)
 *   users/{uid}/notifications/{notificationId}
 *   projects/{projectId}
 *   projects/{projectId}/files/{fileId}
 *   projects/{projectId}/blobs/{sha256}                         (binário, imutável)
 *   projects/{projectId}/blobs/{sha256}/chunks/{index}
 *   projects/{projectId}/documents/{documentId}
 *   projects/{projectId}/snapshots/{snapshotId}                 (imutável)
 *   projects/{projectId}/snapshots/{snapshotId}/grants/{email}  (acesso do revisor)
 *   projects/{projectId}/snapshots/{snapshotId}/files/{name}    (PDF, SyncTeX, texto por página)
 *   projects/{projectId}/snapshots/{snapshotId}/files/{name}/chunks/{index}
 *   projects/{projectId}/reviews/{reviewId}
 *   projects/{projectId}/reviews/{reviewId}/threads/{threadId}
 *   projects/{projectId}/reviews/{reviewId}/threads/{threadId}/comments/{commentId}
 *   projects/{projectId}/diffs/{diffKey}
 *   projects/{projectId}/diffs/{diffKey}/chunks/{index}         (PDF do diff)
 *   projects/{projectId}/aiConversations/{conversationId}
 *   projects/{projectId}/aiConversations/{conversationId}/messages/{messageId}
 *   projects/{projectId}/referenceChecks/{checkId}
 *
 * Não há Cloud Storage: binários ficam no Firestore em pedaços de até
 * 1.000.000 bytes (StoredFileDoc e FileChunkDoc, abaixo).
 */

/** Timestamp compatível com os SDKs web e Admin. */
export interface TimestampLike {
  toDate(): Date;
  toMillis(): number;
}

/** Campo binário (Bytes no SDK web). */
export interface BytesLike {
  toUint8Array(): Uint8Array;
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

// users/{uid}/private/ai  (lido e gravado só pelo próprio usuário)
// Configuração da IA do usuário: lista ordenada de modelos, o primeiro é o
// principal e os demais, reservas. A plataforma não oferece IA própria.
export interface UserAiConfigDoc {
  models: Array<{
    provider: 'anthropic' | 'openai' | 'gemini';
    /** Nulo usa o modelo padrão do provedor. */
    model: string | null;
    apiKey: string;
  }>;
  updatedAt: TimestampLike;
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

export interface MemberProfile {
  name: string;
  email: string;
}

export interface ProjectDoc {
  name: string;
  description: string | null;
  ownerId: UserId;
  /** Mapa uid para papel. Fonte da verdade usada pelas regras de segurança. */
  members: Record<UserId, ProjectRole>;
  /** Espelho das chaves de `members` para consultas `array-contains`. */
  memberIds: UserId[];
  /**
   * Convites de coautoria por e-mail (em minúsculas). O convidado, com e-mail
   * verificado, entra sozinho com esse papel e o convite some.
   */
  pendingMembers: Record<string, 'editor' | 'viewer'>;
  /**
   * Nome e e-mail de cada membro, para a lista de membros (users/{uid} é
   * privado). Cada membro grava só a própria entrada; o dono só remove.
   */
  memberProfiles?: Record<UserId, MemberProfile>;
  engine: LatexEngine;
  mainDocumentId: DocumentId;
  latestSnapshotId: SnapshotId | null;
  /** Contadores sequenciais; as regras só aceitam +1, no mesmo lote do snapshot ou da revisão. */
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
  /** Binários e textos grandes: "projects/{projectId}/blobs/{sha256}" (arquivo em pedaços). */
  blobPath: string | null;
  /** sha256 hexadecimal do conteúdo; nulo para pastas. */
  contentHash: string | null;
  size: number;
  /** Incrementado a cada gravação; usado para concorrência otimista no autosave. */
  revision: number;
  updatedAt: TimestampLike;
  updatedBy: UserId;
}

// ---------------------------------------------------------------------------
// Arquivos em pedaços (binários guardados no Firestore)
// ---------------------------------------------------------------------------

/** Descrição de um arquivo guardado em pedaços; os mesmos limites de firestore.rules. */
export interface StoredFileInfo {
  totalBytes: number;
  contentType: string;
  /** sha256 hexadecimal do conteúdo inteiro, conferido ao remontar. */
  sha256: string;
  chunkCount: number;
  /** Sempre 1.000.000; o último pedaço pode ser menor. */
  chunkBytes: number;
}

// projects/{projectId}/blobs/{sha256} e projects/{projectId}/snapshots/{sid}/files/{name}
// Cabeçalho gravado por último, no mesmo lote do último pedaço. Existir o
// cabeçalho significa que o arquivo está completo; depois disso nada muda.
export interface StoredFileDoc extends StoredFileInfo {
  createdBy: UserId;
  createdAt: TimestampLike;
}

// {arquivo}/chunks/{index}, com index = "0", "1", ...
export interface FileChunkDoc {
  data: BytesLike;
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
  /**
   * Resumo da última compilação de trabalho. O PDF dela não é gravado no banco:
   * cada pessoa compila no próprio navegador, e guardar cada compilação gastaria
   * a cota de 1 GiB do Firestore.
   */
  lastBuild: {
    status: BuildStatus;
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
  /** "projects/{projectId}/snapshots/{snapshotId}/files/{documentId}.pdf" (arquivo em pedaços). */
  pdfPath: string;
  pdfSha256: string;
  pageCount: number;
  /** Dados SyncTeX para mapear PDF e código-fonte: ".../files/{documentId}.synctex". */
  synctexPath: string | null;
  /** JSON com o texto extraído por página, para ancorar comentários: ".../files/{documentId}.pages". */
  pageTextPath: string | null;
}

// projects/{projectId}/snapshots/{snapshotId}
// Escrito UMA vez pelo app de quem congela, no mesmo lote que avança
// `counters.snapshots`, depois de gravar os blobs e os arquivos da versão. As regras negam
// qualquer update/delete: o snapshot é imutável.
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

// projects/{projectId}/snapshots/{snapshotId}/grants/{email}
// Existência deste documento (id = e-mail do revisor em minúsculas) libera a
// leitura do snapshot para quem entrar com esse e-mail verificado.
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
export type ReviewAccess = 'email' | 'link';

// projects/{projectId}/reviews/{reviewId}/links/{token}: o id é o código secreto do link.
export interface ReviewLinkDoc {
  createdBy: UserId;
  createdAt: TimestampLike;
}

// projects/{projectId}/snapshots/{snapshotId}/guests/{uid}: ficha de quem entrou pelo link, sem conta.
export interface ReviewGuestDoc {
  reviewId: ReviewId;
  token: string;
  /** Nome como a pessoa digitou. */
  name: string;
  /** Nome normalizado: o mesmo nome, em qualquer aparelho, é o mesmo revisor. */
  guestKey: string;
  createdAt: TimestampLike;
}

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
  /** E-mail convidado na criação; vazio numa revisão aberta só por link. */
  reviewerEmail: string;
  /** E-mails acrescentados depois pelo "Envio da revisão" (incluem o primeiro). Ausente em revisões antigas. */
  reviewerEmails?: string[];
  /** "email": só convidados, com login; "link": qualquer pessoa com o link, sem conta. Ausente vale "email". */
  access?: ReviewAccess;
  /** Preenchidos pelo revisor que agiu por último (ao abrir ou mudar o status). */
  reviewerUid: UserId | null;
  reviewerName: string | null;
  status: ReviewStatus;
  grantedDocumentIds: DocumentId[];
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
    /** Carimbado pelo app de quem congela a próxima versão. */
    fixedInSnapshotId: SnapshotId | null;
  } | null;
  sourceHint: SourceLocation | null;
  /** Thread herdada de uma rodada anterior ainda aberta. */
  carriedFromThreadId: ThreadId | null;
  createdBy: UserId;
  createdByRole: ParticipantRole;
  /** Mantidos pelo app no mesmo lote do comentário; as regras só aceitam +1. */
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
  /** Revisor pelo link: identidade pelo nome (ReviewGuestDoc.guestKey). Ausente nos demais. */
  authorKey?: string | null;
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

// projects/{projectId}/diffs/{diffKey}
// diffKey = `${baseSnapshotId}_${targetSnapshotId}_${documentId}_${engineVersion}`.
// Cache do PDF de diff gerado no navegador: snapshots são imutáveis, então a
// mesma chave sempre produz o mesmo resultado e é gravada uma vez só.
export interface DiffDoc {
  documentId: DocumentId;
  baseSnapshotId: SnapshotId;
  targetSnapshotId: SnapshotId;
  engineVersion: string;
  /** Nível alcançado na escada de degradação (ver docs/07-fluxos.md). */
  granularity: DiffGranularity;
  /** PDF do diff, em pedaços na subcoleção chunks deste documento; nulo se não compilou. */
  pdf: StoredFileInfo | null;
  stats: { insertedWords: number; deletedWords: number; changedBlocks: number };
  /** Limitado a 500 marcadores para respeitar o tamanho máximo do documento. */
  changes: DiffChangeMarker[];
  createdBy: UserId;
  createdAt: TimestampLike;
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
// Gravado pelo app ao fim de cada resposta.
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
  /** Mesmo formato de `ReferenceAudit` em src/lib/ai/schemas.ts. */
  results: Array<{
    key: string;
    url: string | null;
    linkStatus: 'ok' | 'broken' | 'blocked' | 'unchecked' | 'no_url';
    verdict: 'matches' | 'mismatch' | 'unreachable' | 'uncertain';
    explanation: string;
  }>;
  summary: { ok: number; problems: number; uncertain: number };
  createdAt: TimestampLike;
}
