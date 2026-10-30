import type { Response } from 'express';
import { NDJSON_CONTENT_TYPE, type AiStreamEvent } from '@shared/ai/schemas';

export interface NdjsonWriter {
  send(event: AiStreamEvent): void;
  end(): void;
  readonly closed: boolean;
}

/**
 * Escreve um evento por linha (NDJSON). Cada `send` vai imediatamente para o
 * socket: nada de buffer no servidor, para o cliente perceber a resposta
 * assim que o primeiro token chega.
 */
export function createNdjsonWriter(res: Response): NdjsonWriter {
  let closed = false;
  res.on('close', () => {
    closed = true;
  });

  res.status(200);
  res.setHeader('Content-Type', NDJSON_CONTENT_TYPE);
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  // Impede proxies (ex.: nginx) de acumular a resposta antes de repassar.
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  return {
    send(event) {
      if (closed) return;
      res.write(`${JSON.stringify(event)}\n`);
    },
    end() {
      if (closed) return;
      closed = true;
      res.end();
    },
    get closed() {
      return closed;
    },
  };
}
