/**
 * Arquivos binários guardados no próprio Firestore (sem Cloud Storage): o
 * conteúdo é dividido em pedaços de até CHUNK_BYTES, cada um num documento
 * `{arquivo}/chunks/{índice}`, e um cabeçalho guarda tamanho, hash e número de
 * pedaços. Este módulo é puro; a leitura e a gravação ficam em
 * src/lib/firebase/stored-files.ts. Modelo em docs/06-banco-de-dados.md.
 */

/**
 * Bytes por pedaço. O documento do Firestore aceita até 1 MiB (1.048.576 bytes)
 * somando nome e campos; 1.000.000 deixa folga para o caminho do documento.
 * O mesmo valor está fixo em firestore.rules (chunkBytes).
 */
export const CHUNK_BYTES = 1_000_000;

/**
 * Pedaços por lote de gravação. O pedido ao Firestore tem teto de 10 MiB e o
 * SDK web envia os bytes em base64 (um terço maior): 4 pedaços somam cerca de
 * 5,3 MB no fio.
 */
export const CHUNKS_PER_BATCH = 4;

export class StoredFileError extends Error {}

/** O que o cabeçalho descreve; os mesmos nomes de campo do Firestore. */
export interface ChunkLayout {
  totalBytes: number;
  chunkCount: number;
  chunkBytes: number;
}

export interface ChunkRange {
  index: number;
  start: number;
  end: number;
}

/** Fatias do conteúdo, em ordem. Arquivo vazio não tem pedaço nenhum. */
export function chunkRanges(totalBytes: number, chunkBytes = CHUNK_BYTES): ChunkRange[] {
  const ranges: ChunkRange[] = [];
  for (let start = 0, index = 0; start < totalBytes; start += chunkBytes, index++) {
    ranges.push({ index, start, end: Math.min(start + chunkBytes, totalBytes) });
  }
  return ranges;
}

export function layoutOf(totalBytes: number, chunkBytes = CHUNK_BYTES): ChunkLayout {
  return { totalBytes, chunkCount: Math.ceil(totalBytes / chunkBytes), chunkBytes };
}

export function groupsOf<T>(items: readonly T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let start = 0; start < items.length; start += size) groups.push(items.slice(start, start + size));
  return groups;
}

/**
 * Remonta o conteúdo a partir dos pedaços lidos (índice e bytes). Pedaços além
 * de chunkCount são ignorados; faltar um ou ter tamanho errado é erro.
 */
export function joinChunks(parts: ReadonlyMap<number, Uint8Array>, layout: ChunkLayout): Uint8Array {
  const data = new Uint8Array(layout.totalBytes);
  for (const { index, start, end } of chunkRanges(layout.totalBytes, layout.chunkBytes)) {
    const part = parts.get(index);
    if (!part) throw new StoredFileError(`Pedaço ${index} do arquivo não encontrado.`);
    if (part.byteLength !== end - start) throw new StoredFileError(`Pedaço ${index} do arquivo com tamanho inesperado.`);
    data.set(part, start);
  }
  return data;
}

export async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data as BufferSource);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
