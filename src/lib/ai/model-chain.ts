/**
 * Saúde da fila de modelos: quem falhou recentemente vai para o fim da fila
 * por um tempo que depende do motivo. Vive em memória da aba (não precisa
 * sobreviver a um recarregamento).
 */
import { resolveModel } from './providers';
import type { AiErrorCode, AiModelConfig } from './schemas';

export type PauseReason = 'limit' | 'model' | 'credential';

const PAUSE_MS: Record<PauseReason, number> = {
  // Limite de uso, sobrecarga ou demora: a cota costuma voltar em segundos.
  limit: 60_000,
  // Modelo inexistente ou sem acesso: o provedor retira modelos e responde 404 para sempre.
  model: 30 * 60_000,
  // Chave recusada: curta, para uma chave corrigida voltar logo.
  credential: 60_000,
};

export interface ModelHealth {
  reason: PauseReason;
  message: string;
  until: number;
}

const health = new Map<string, ModelHealth>();

/** Impressão digital da chave (FNV-1a): a fila nunca guarda a chave em claro como identificador. */
function fingerprint(key: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < key.length; index++) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

/** Trocar a chave ou o modelo muda a identidade do item, que sai da pausa na hora. */
const identity = (entry: AiModelConfig) => `${entry.provider}|${resolveModel(entry)}|${fingerprint(entry.apiKey)}`;

function pauseReasonFor(code: AiErrorCode): PauseReason | null {
  switch (code) {
    case 'rate_limited':
    case 'upstream':
    case 'network':
      return 'limit';
    case 'forbidden':
      return 'model';
    case 'invalid_key':
      return 'credential';
    default:
      return null;
  }
}

export function healthOf(entry: AiModelConfig, now = Date.now()): ModelHealth | null {
  const current = health.get(identity(entry));
  return current && current.until > now ? current : null;
}

/** Itens prontos primeiro, na ordem configurada; os em pausa vão para o fim e ainda são tentados. */
export function orderByHealth(chain: readonly AiModelConfig[], now = Date.now()): AiModelConfig[] {
  const ready = chain.filter((entry) => !healthOf(entry, now));
  return [...ready, ...chain.filter((entry) => healthOf(entry, now))];
}

/**
 * Registra a falha. Pausar por modelo ou por chave só faz sentido quando há
 * reserva: com um modelo só, a ordem da fila não muda nada.
 */
export function recordFailure(entry: AiModelConfig, code: AiErrorCode, message: string, hasFallback: boolean): void {
  const reason = pauseReasonFor(code);
  if (!reason || (reason !== 'limit' && !hasFallback)) return;
  health.set(identity(entry), { reason, message, until: Date.now() + PAUSE_MS[reason] });
}

export function recordSuccess(entry: AiModelConfig): void {
  health.delete(identity(entry));
}
