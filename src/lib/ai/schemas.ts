/**
 * Contrato do assistente de IA.
 *
 * A IA roda no navegador com a chave de API do próprio usuário. O motor
 * (`run-task.ts`) transforma o stream do provedor em eventos `AiEvent`, um por
 * fragmento de texto ou etapa, que a interface consome incrementalmente.
 * Saídas estruturadas são validadas com estes schemas Zod antes de chegar à UI.
 */
import { z } from 'zod';

export const AI_TASKS = [
  'chat',
  'rewriteText',
  'paraphrase',
  'reorganizeTopics',
  'updateToc',
  'generateDraft',
  'checkReferences',
] as const;

export const AiTaskSchema = z.enum(AI_TASKS);
export type AiTask = z.infer<typeof AiTaskSchema>;

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

export interface AiSelection {
  fileId: string;
  path: string;
  text: string;
  startLine: number;
  endLine: number;
}

export interface AiTaskInput {
  task: AiTask;
  prompt: string;
  selection: AiSelection | null;
  /** Últimas mensagens concluídas da conversa, da mais antiga para a mais nova. */
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
}

/** Arquivo do projeto usado como contexto (compatível com o modelo de visão do editor). */
export interface AiSourceFile {
  id: string;
  path: string;
  kind: string;
  content: string | null;
}

// ---------------------------------------------------------------------------
// Saídas estruturadas
// ---------------------------------------------------------------------------

/** Proposta de estrutura para `reorganizeTopics` e `updateToc`. */
export const OutlineProposalSchema = z.object({
  summary: z.string(),
  sections: z.array(
    z.object({
      level: z.enum(['part', 'chapter', 'section', 'subsection', 'subsubsection']),
      title: z.string(),
      sourcePath: z.string().nullable(),
      action: z.enum(['keep', 'move', 'rename', 'merge', 'split', 'create', 'remove']),
      rationale: z.string(),
    }),
  ),
  /** Trecho LaTeX pronto para o autor revisar e aplicar no editor. */
  latex: z.string(),
});
export type OutlineProposal = z.infer<typeof OutlineProposalSchema>;

/**
 * O que o modelo devolve em `checkReferences`: apenas o julgamento semântico.
 * Se o link abriu ou não vem dos blocos de resultado da ferramenta de busca de
 * páginas, nunca do texto do modelo.
 */
export const ReferenceJudgementSchema = z.object({
  judgements: z.array(
    z.object({
      key: z.string(),
      verdict: z.enum(['matches', 'mismatch', 'unreachable', 'uncertain']),
      explanation: z.string(),
    }),
  ),
});
export type ReferenceJudgement = z.infer<typeof ReferenceJudgementSchema>;

export const LinkStatusSchema = z.enum(['ok', 'broken', 'blocked', 'unchecked', 'no_url']);
export type LinkStatus = z.infer<typeof LinkStatusSchema>;

/** Resultado final de `checkReferences` (julgamento do modelo + resultado da busca). */
export const ReferenceAuditSchema = z.object({
  results: z.array(
    z.object({
      key: z.string(),
      url: z.string().nullable(),
      linkStatus: LinkStatusSchema,
      verdict: z.enum(['matches', 'mismatch', 'unreachable', 'uncertain']),
      explanation: z.string(),
    }),
  ),
  summary: z.object({
    ok: z.number().int().min(0),
    problems: z.number().int().min(0),
    uncertain: z.number().int().min(0),
  }),
});
export type ReferenceAudit = z.infer<typeof ReferenceAuditSchema>;

export const AiStructuredResultSchema = z.discriminatedUnion('task', [
  z.object({ task: z.literal('reorganizeTopics'), data: OutlineProposalSchema }),
  z.object({ task: z.literal('updateToc'), data: OutlineProposalSchema }),
  z.object({ task: z.literal('checkReferences'), data: ReferenceAuditSchema }),
]);
export type AiStructuredResult = z.infer<typeof AiStructuredResultSchema>;

// ---------------------------------------------------------------------------
// Eventos do motor
// ---------------------------------------------------------------------------

export type AiErrorCode =
  | 'not_configured'
  | 'invalid_key'
  | 'forbidden'
  | 'refused'
  | 'truncated'
  | 'invalid_output'
  | 'rate_limited'
  | 'upstream'
  | 'network'
  | 'internal';

export type AiEvent =
  | { type: 'status'; stage: 'retrieving' | 'checking_links' | 'generating' | 'validating' | 'fallback'; message: string }
  | { type: 'context'; sources: Array<{ path: string; startLine: number; endLine: number; score: number }> }
  | { type: 'delta'; text: string }
  | { type: 'result'; result: AiStructuredResult }
  /** Troca para o próximo modelo da lista; a UI descarta o que o anterior já tinha escrito. */
  | { type: 'switch'; message: string }
  | {
      type: 'done';
      stopReason: string | null;
      usage: { inputTokens: number; outputTokens: number };
      servedBy: { provider: string; model: string };
    };

/** Falha do motor; `discardPartial` pede que a UI descarte o texto parcial já exibido. */
export class AiTaskError extends Error {
  constructor(
    readonly code: AiErrorCode,
    message: string,
    readonly retryable: boolean,
    readonly discardPartial = false,
  ) {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// Configuração da IA do usuário
// ---------------------------------------------------------------------------

export const MAX_AI_MODELS = 5;

export const AiModelConfigSchema = z.object({
  provider: z.enum(['anthropic', 'openai', 'gemini']),
  /** `null` usa o modelo padrão do provedor. */
  model: z.string().min(1).nullable(),
  /** Vazio numa reserva: herda a chave do item anterior do mesmo provedor. */
  apiKey: z.string().trim().max(500),
});

/** Lista ordenada: o primeiro é o modelo principal; os demais, reservas. */
export const AiConfigSchema = z.object({
  models: z.array(AiModelConfigSchema).min(1).max(MAX_AI_MODELS),
});

export type AiModelConfig = z.infer<typeof AiModelConfigSchema>;
export type AiConfig = z.infer<typeof AiConfigSchema>;
