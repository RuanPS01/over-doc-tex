import { AiStreamEventSchema, type AiRequest, type AiStreamEvent } from '@shared/ai/schemas';
import { apiBaseUrl } from '@/lib/firebase/app';
import { readNdjson } from './ndjson';

export class AiHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Abre o stream da IA e devolve os eventos já validados, um a um. */
export async function* streamAiTask(
  request: AiRequest,
  options: { token: string; signal: AbortSignal },
): AsyncGenerator<AiStreamEvent> {
  const response = await fetch(`${apiBaseUrl}/aiStream`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${options.token}` },
    body: JSON.stringify(request),
    signal: options.signal,
  });

  if (!response.ok || !response.body) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new AiHttpError(response.status, payload?.message ?? 'Não foi possível iniciar o assistente.');
  }

  yield* readNdjson(response.body, AiStreamEventSchema);
}
