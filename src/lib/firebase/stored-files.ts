/**
 * Leitura e gravação de arquivos em pedaços no Firestore (ver
 * src/lib/stored-files/chunks.ts). Os pedaços sobem primeiro, em lotes; o
 * cabeçalho entra no mesmo lote do último pedaço, e as regras só aceitam o
 * cabeçalho se esse último pedaço existir. Assim, cabeçalho existente quer
 * dizer arquivo completo.
 */
import {
  Bytes,
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  writeBatch,
  type Firestore,
  type WriteBatch,
} from 'firebase/firestore';
import { firestorePaths } from '@shared/firestore/paths';
import type { FileChunkDoc, StoredFileDoc, StoredFileInfo } from '@shared/firestore/types';
import { t } from '@/lib/i18n';
import {
  CHUNKS_PER_BATCH,
  StoredFileError,
  chunkRanges,
  groupsOf,
  joinChunks,
  layoutOf,
  sha256Hex,
} from '@/lib/stored-files/chunks';

export { StoredFileError } from '@/lib/stored-files/chunks';

export interface WriteChunksOptions {
  contentType: string;
  /** Já calculado por quem chama (ex.: blob endereçado pelo hash), para não repetir. */
  sha256?: string;
  /** Acrescenta ao último lote o documento que descreve o arquivo. */
  finalize: (batch: WriteBatch, info: StoredFileInfo) => void;
  /** Confere se o arquivo já foi finalizado por outra pessoa quando o último lote falha. */
  isFinalized: () => Promise<boolean>;
}

/**
 * Grava os pedaços em `parentPath/chunks` e, no último lote, o documento que
 * `finalize` acrescentar. Usado direto pelo diff, cujo documento já existe com
 * outros campos; os demais arquivos passam por writeStoredFile.
 */
export async function writeChunks(
  db: Firestore,
  parentPath: string,
  data: Uint8Array,
  options: WriteChunksOptions,
): Promise<StoredFileInfo> {
  const info: StoredFileInfo = {
    ...layoutOf(data.byteLength),
    contentType: options.contentType,
    sha256: options.sha256 ?? (await sha256Hex(data)),
  };
  const groups = groupsOf(chunkRanges(data.byteLength), CHUNKS_PER_BATCH);
  // Arquivo vazio: só o lote final, sem pedaços.
  if (groups.length === 0) groups.push([]);

  for (const [position, group] of groups.entries()) {
    const batch = writeBatch(db);
    for (const { index, start, end } of group) {
      const chunk: FileChunkDoc = { data: Bytes.fromUint8Array(data.subarray(start, end)) };
      batch.set(doc(db, firestorePaths.chunk(parentPath, index)), chunk);
    }
    const isLast = position === groups.length - 1;
    if (isLast) options.finalize(batch, info);
    try {
      await batch.commit();
    } catch (error) {
      // Duas pessoas enviando o mesmo conteúdo: quem chega depois encontra o cabeçalho pronto.
      if (isLast && (await options.isFinalized())) return info;
      throw error;
    }
  }
  return info;
}

/**
 * Grava um arquivo com cabeçalho próprio (blob ou arquivo de versão). Se o
 * cabeçalho já existe, o arquivo está completo e nada é enviado.
 */
export async function writeStoredFile(
  db: Firestore,
  path: string,
  data: Uint8Array,
  options: { contentType: string; uid: string; sha256?: string },
): Promise<'created' | 'exists'> {
  const header = doc(db, path);
  const isFinalized = async () => (await getDoc(header)).exists();
  if (await isFinalized()) return 'exists';

  await writeChunks(db, path, data, {
    contentType: options.contentType,
    sha256: options.sha256,
    isFinalized,
    finalize: (batch, info) => batch.set(header, { ...info, createdBy: options.uid, createdAt: serverTimestamp() }),
  });
  return 'created';
}

/** Lê e remonta os pedaços descritos por `info`, conferindo o sha256. */
export async function readChunks(db: Firestore, parentPath: string, info: StoredFileInfo): Promise<Uint8Array> {
  const snapshot = info.chunkCount === 0 ? null : await getDocs(collection(db, firestorePaths.chunks(parentPath)));
  const parts = new Map<number, Uint8Array>();
  for (const chunk of snapshot?.docs ?? []) {
    parts.set(Number(chunk.id), (chunk.data() as FileChunkDoc).data.toUint8Array());
  }
  const data = joinChunks(parts, info);
  if ((await sha256Hex(data)) !== info.sha256) {
    throw new StoredFileError(t('O arquivo guardado não confere com o hash registrado.'));
  }
  return data;
}

export async function readStoredFile(db: Firestore, path: string): Promise<{ info: StoredFileInfo; data: Uint8Array }> {
  const header = await getDoc(doc(db, path));
  if (!header.exists()) throw new StoredFileError(t('Arquivo não encontrado.'));
  const { totalBytes, contentType, sha256, chunkCount, chunkBytes } = header.data() as StoredFileDoc;
  const info: StoredFileInfo = { totalBytes, contentType, sha256, chunkCount, chunkBytes };
  return { info, data: await readChunks(db, path, info) };
}
