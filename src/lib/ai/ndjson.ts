import type { z } from 'zod';

export class NdjsonParseError extends Error {
  constructor(readonly line: string) {
    super('Linha NDJSON fora do formato esperado.');
  }
}

function parseLine<T>(line: string, schema: z.ZodType<T>): T {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    throw new NdjsonParseError(line);
  }
  const result = schema.safeParse(raw);
  if (!result.success) throw new NdjsonParseError(line);
  return result.data;
}

/**
 * Lê um corpo NDJSON incrementalmente: cada linha completa vira um evento
 * validado por Zod assim que chega, sem esperar o fim da resposta.
 */
export async function* readNdjson<T>(body: ReadableStream<Uint8Array>, schema: z.ZodType<T>): AsyncGenerator<T> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf('\n');
      while (newline !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line) yield parseLine(line, schema);
        newline = buffer.indexOf('\n');
      }
    }
    const rest = (buffer + decoder.decode()).trim();
    if (rest) yield parseLine(rest, schema);
  } finally {
    reader.releaseLock();
  }
}
