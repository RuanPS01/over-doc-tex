import type { MemberProfile, ProjectDoc, SnapshotDoc, SnapshotRender } from '@shared/firestore/types';
import { MAIN_DOCUMENT_ID, normalizeProjectName } from '@/features/projects/model/new-project';
import { countWords, type VersionNumber, versionLabel } from '@/features/snapshots/model/version';

/**
 * Sala de revisão de PDF avulso (docs/07-fluxos.md, cenário E): um projeto
 * `kind: "pdf"` sem arquivos nem documentos. Cada PDF enviado vira uma versão
 * (snapshot) com o documento "main" e cada versão abre uma rodada de revisão,
 * com os mesmos comentários, desenhos e envio das revisões de LaTeX.
 */

/** Teto do arquivo de versão nas regras (snapshots/{sid}/files). */
export const MAX_PDF_BYTES = 52_428_800;

/** O PDF da sala é sempre o documento principal da versão. */
export const PDF_ROOM_DOCUMENT_ID = MAIN_DOCUMENT_ID;

/** O arquivo é um PDF: a assinatura "%PDF-" aparece no primeiro KiB (a especificação tolera lixo antes). */
export function isPdfData(data: Uint8Array): boolean {
  const head = new TextDecoder('latin1').decode(data.subarray(0, 1024));
  return head.includes('%PDF-');
}

/** Nome sugerido para a sala: o nome do arquivo sem a extensão. */
export function roomNameFromFile(fileName: string): string {
  return normalizeProjectName(fileName.replace(/\.pdf$/i, '').replace(/[_]+/g, ' ')) ?? '';
}

/** Tamanho legível (KB, MB) para o seletor de arquivo. */
export function formatBytes(bytes: number, locale: string): string {
  const format = (value: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
  if (bytes < 1024 * 1024) return `${format(Math.max(1, bytes / 1024))} KB`;
  return `${format(bytes / (1024 * 1024))} MB`;
}

type WithServerTime<T, K extends keyof T> = Omit<T, K> & Record<K, unknown>;

/** Documento do projeto da sala: segue a regra de criação (só o dono, contadores zerados) com `kind: "pdf"`. */
export function buildPdfRoom(input: { uid: string; profile?: MemberProfile; name: string; now: unknown }): WithServerTime<ProjectDoc, 'createdAt' | 'updatedAt'> {
  return {
    name: input.name,
    kind: 'pdf',
    description: null,
    ownerId: input.uid,
    members: { [input.uid]: 'owner' },
    memberIds: [input.uid],
    pendingMembers: {},
    memberProfiles: input.profile ? { [input.uid]: input.profile } : {},
    engine: 'pdflatex',
    mainDocumentId: PDF_ROOM_DOCUMENT_ID,
    latestSnapshotId: null,
    counters: { snapshots: 0, reviews: 0 },
    stats: { fileCount: 0, totalBytes: 0 },
    createdAt: input.now,
    updatedAt: input.now,
    archivedAt: null,
  };
}

export interface PdfSnapshotInput {
  uid: string;
  /** Nome do arquivo enviado (aparece como título e caminho do documento). */
  fileName: string;
  version: VersionNumber;
  sequence: number;
  parentSnapshotId: string | null;
  message: string;
  pdfSha256: string;
  pdfPath: string;
  pageTextPath: string;
  pages: readonly string[];
  now: unknown;
}

/**
 * Versão da sala: sem manifesto de arquivos (não há código), um documento
 * "main" com o PDF enviado e o texto por página, sem SyncTeX. O sha256 do PDF
 * faz o papel do hash do código-fonte.
 */
export function buildPdfSnapshot(input: PdfSnapshotInput): WithServerTime<SnapshotDoc, 'createdAt'> {
  const render: SnapshotRender = {
    title: input.fileName,
    role: 'main',
    rootPath: input.fileName,
    pdfPath: input.pdfPath,
    pdfSha256: input.pdfSha256,
    pageCount: input.pages.length,
    synctexPath: null,
    pageTextPath: input.pageTextPath,
  };
  return {
    label: versionLabel(input.version),
    version: input.version,
    sequence: input.sequence,
    parentSnapshotId: input.parentSnapshotId,
    message: input.message.trim() || null,
    engine: 'pdflatex',
    files: [],
    sourceHash: input.pdfSha256,
    documents: { [PDF_ROOM_DOCUMENT_ID]: render },
    stats: { words: countWords(input.pages), pages: input.pages.length },
    createdBy: input.uid,
    createdAt: input.now,
  };
}
