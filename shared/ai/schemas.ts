/**
 * Contrato da IA entre cliente e backend.
 *
 * - O cliente envia `AiRequest` (POST) e consome a resposta como NDJSON:
 *   uma linha JSON por evento `AiStreamEvent`.
 * - Saídas estruturadas (tarefas em STRUCTURED_TASKS) são validadas no
 *   backend com estes mesmos schemas antes de chegar ao cliente, e o cliente
 *   valida de novo ao ler cada linha.
 */
import { z } from 'zod';

export const NDJSON_CONTENT_TYPE = 'application/x-ndjson; charset=utf-8';

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

/** Tarefas que respondem com JSON estruturado em vez de deltas de texto. */
export const STRUCTURED_TASKS = ['reorganizeTopics', 'updateToc', 'checkReferences'] as const;
export type StructuredTask = (typeof STRUCTURED_TASKS)[number];

export function isStructuredTask(task: AiTask): task is StructuredTask {
  return (STRUCTURED_TASKS as readonly string[]).includes(task);
}

// ---------------------------------------------------------------------------
// Requisição
// ---------------------------------------------------------------------------

export const AiSelectionSchema = z.object({
  fileId: z.string().min(1),
  path: z.string().min(1),
  text: z.string().max(20_000),
  startLine: z.number().int().min(1),
  endLine: z.number().int().min(1),
});
export type AiSelection = z.infer<typeof AiSelectionSchema>;

export const AiRequestSchema = z.object({
  projectId: z.string().min(1),
  conversationId: z.string().min(1).nullable(),
  task: AiTaskSchema,
  prompt: z.string().trim().min(1).max(8_000),
  selection: AiSelectionSchema.nullable(),
  scope: z.object({
    /** Vazio significa "projeto inteiro". */
    fileIds: z.array(z.string().min(1)).max(50),
    /** Permite que a tarefa consulte fontes externas (ex.: páginas das referências). */
    allowExternalSources: z.boolean(),
  }),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(20_000) }))
    .max(20),
});
export type AiRequest = z.infer<typeof AiRequestSchema>;

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
 * Status HTTP e disponibilidade vêm do verificador de links do backend,
 * nunca do modelo.
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

export const LinkStatusSchema = z.enum(['ok', 'redirected', 'broken', 'timeout', 'blocked', 'no_url']);
export type LinkStatus = z.infer<typeof LinkStatusSchema>;

/** Resultado final de `checkReferences` (julgamento do modelo + verificação HTTP). */
export const ReferenceAuditSchema = z.object({
  results: z.array(
    z.object({
      key: z.string(),
      url: z.string().nullable(),
      linkStatus: LinkStatusSchema,
      httpStatus: z.number().int().nullable(),
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
// Eventos do stream NDJSON
// ---------------------------------------------------------------------------

export const AiStreamEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('meta'),
    requestId: z.string(),
    task: AiTaskSchema,
    conversationId: z.string().nullable(),
  }),
  z.object({
    type: z.literal('status'),
    stage: z.enum(['retrieving', 'checking_links', 'generating', 'validating', 'fallback']),
    message: z.string(),
  }),
  z.object({
    type: z.literal('context'),
    sources: z.array(
      z.object({
        path: z.string(),
        startLine: z.number().int(),
        endLine: z.number().int(),
        score: z.number(),
      }),
    ),
  }),
  z.object({ type: z.literal('delta'), text: z.string() }),
  z.object({ type: z.literal('result'), result: AiStructuredResultSchema }),
  z.object({
    type: z.literal('error'),
    code: z.enum([
      'unauthenticated',
      'forbidden',
      'invalid_request',
      'refused',
      'truncated',
      'invalid_output',
      'rate_limited',
      'upstream',
      'internal',
    ]),
    message: z.string(),
    retryable: z.boolean(),
    /** Quando verdadeiro, o cliente deve descartar o texto parcial já exibido. */
    discardPartial: z.boolean(),
  }),
  z.object({
    type: z.literal('done'),
    stopReason: z.string().nullable(),
    usage: z.object({ inputTokens: z.number().int(), outputTokens: z.number().int() }),
  }),
]);
export type AiStreamEvent = z.infer<typeof AiStreamEventSchema>;
export type AiErrorCode = Extract<AiStreamEvent, { type: 'error' }>['code'];
