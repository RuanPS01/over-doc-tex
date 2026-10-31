import { describe, expect, it } from 'vitest';
import {
  CHUNK_BYTES,
  CHUNKS_PER_BATCH,
  StoredFileError,
  chunkRanges,
  groupsOf,
  joinChunks,
  layoutOf,
  sha256Hex,
} from '@/lib/stored-files/chunks';

function bytes(length: number): Uint8Array {
  const data = new Uint8Array(length);
  for (let index = 0; index < length; index++) data[index] = index % 251;
  return data;
}

function split(data: Uint8Array): Map<number, Uint8Array> {
  return new Map(chunkRanges(data.byteLength).map(({ index, start, end }) => [index, data.slice(start, end)]));
}

describe('arquivos em pedaços', () => {
  it('divide em pedaços de CHUNK_BYTES, com o último menor', () => {
    const ranges = chunkRanges(2 * CHUNK_BYTES + 10);
    expect(ranges).toEqual([
      { index: 0, start: 0, end: CHUNK_BYTES },
      { index: 1, start: CHUNK_BYTES, end: 2 * CHUNK_BYTES },
      { index: 2, start: 2 * CHUNK_BYTES, end: 2 * CHUNK_BYTES + 10 },
    ]);
    expect(layoutOf(2 * CHUNK_BYTES + 10)).toEqual({ totalBytes: 2 * CHUNK_BYTES + 10, chunkCount: 3, chunkBytes: CHUNK_BYTES });
  });

  it('tamanho múltiplo exato não cria pedaço vazio', () => {
    expect(chunkRanges(CHUNK_BYTES)).toHaveLength(1);
    expect(layoutOf(CHUNK_BYTES).chunkCount).toBe(1);
  });

  it('arquivo vazio não tem pedaços', () => {
    expect(chunkRanges(0)).toEqual([]);
    expect(layoutOf(0).chunkCount).toBe(0);
    expect(joinChunks(new Map(), layoutOf(0))).toEqual(new Uint8Array());
  });

  it('agrupa os pedaços em lotes', () => {
    const groups = groupsOf(chunkRanges(9 * CHUNK_BYTES), CHUNKS_PER_BATCH);
    expect(groups.map((group) => group.length)).toEqual([4, 4, 1]);
  });

  it('remonta o conteúdo original e ignora pedaços sobrando', async () => {
    const data = bytes(2 * CHUNK_BYTES + 777);
    const parts = split(data);
    parts.set(99, new Uint8Array([1, 2, 3]));
    const joined = joinChunks(parts, layoutOf(data.byteLength));
    // toEqual em 2 MB é lento demais; tamanho e hash bastam.
    expect(joined.byteLength).toBe(data.byteLength);
    expect(await sha256Hex(joined)).toBe(await sha256Hex(data));
  });

  it('acusa pedaço faltando ou com tamanho errado', () => {
    const data = bytes(CHUNK_BYTES + 5);
    const missing = split(data);
    missing.delete(1);
    expect(() => joinChunks(missing, layoutOf(data.byteLength))).toThrow(StoredFileError);

    const truncated = split(data);
    truncated.set(0, data.slice(0, 10));
    expect(() => joinChunks(truncated, layoutOf(data.byteLength))).toThrow(/tamanho inesperado/);
  });

  it('calcula o sha256 em hexadecimal', async () => {
    expect(await sha256Hex(new TextEncoder().encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
