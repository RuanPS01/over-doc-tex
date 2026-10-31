/**
 * Modelos padrão de cada provedor. Ficam fora dos arquivos dos provedores para
 * que o registro e a interface os leiam sem baixar os SDKs, que só carregam
 * quando o usuário verifica uma chave, lista modelos ou envia um pedido.
 */
export const ANTHROPIC_MODEL = 'claude-opus-5-5';

export const OPENAI_DEFAULT_MODEL = 'gpt-5';

/**
 * Apelido do Flash-Lite mais recente. Medido em 31/10/2026 no nível gratuito:
 * cerca de 1 s por resposta, enquanto o Flash completo passou de 1 min e
 * devolveu 503 (alta demanda) em horário de pico.
 */
export const GEMINI_DEFAULT_MODEL = 'gemini-flash-lite-latest';
