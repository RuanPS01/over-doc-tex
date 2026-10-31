/**
 * Configuração da IA guardada neste navegador, usada quando não há login
 * (modo demonstração). Com login, a configuração fica na conta do usuário
 * (users/{uid}/private/ai). Leituras e escritas ficam em try/catch: o
 * localStorage pode falhar em aba anônima ou sem cota.
 */
import { AiConfigSchema, type AiConfig } from './schemas';

const STORAGE_KEY = 'overdoctex.ai-config';
const listeners = new Set<() => void>();

// Cache para o useSyncExternalStore receber sempre o mesmo objeto enquanto nada muda.
let cachedRaw: string | null = null;
let cachedConfig: AiConfig | null = null;

function readRaw(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export const localAiConfigStorage = {
  get(): AiConfig | null {
    const raw = readRaw();
    if (raw === cachedRaw) return cachedConfig;
    cachedRaw = raw;
    try {
      const parsed = AiConfigSchema.safeParse(raw ? JSON.parse(raw) : null);
      cachedConfig = parsed.success ? parsed.data : null;
    } catch {
      cachedConfig = null;
    }
    return cachedConfig;
  },
  set(config: AiConfig | null): void {
    try {
      if (config) localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Sem armazenamento disponível: a configuração vale só até recarregar a página.
      cachedRaw = config ? JSON.stringify(config) : null;
      cachedConfig = config;
    }
    for (const listener of listeners) listener();
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

/** Exibe só o começo e o fim da chave. */
export function maskApiKey(key: string): string {
  return key.length <= 12 ? '...' : `${key.slice(0, 6)}...${key.slice(-4)}`;
}
