import type { AiTask } from './schemas';

export type Effort = 'low' | 'medium' | 'high';

export interface TaskConfig {
  /** Profundidade de raciocínio do modelo (output_config.effort). */
  effort: Effort;
  maxTokens: number;
  /** Como montar o contexto: ranking BM25 pela pergunta ou abertura de cada seção. */
  context: 'bm25' | 'section-leads';
  contextBudgetChars: number;
  /** Tarefas que respondem com JSON validado em vez de texto livre. */
  structured: boolean;
}

/** Registro central das tarefas: adicionar uma tarefa começa aqui e em prompts.ts. */
export const TASKS: Record<AiTask, TaskConfig> = {
  chat: { effort: 'low', maxTokens: 16_000, context: 'bm25', contextBudgetChars: 40_000, structured: false },
  rewriteText: { effort: 'medium', maxTokens: 16_000, context: 'bm25', contextBudgetChars: 20_000, structured: false },
  paraphrase: { effort: 'low', maxTokens: 16_000, context: 'bm25', contextBudgetChars: 12_000, structured: false },
  generateDraft: { effort: 'high', maxTokens: 64_000, context: 'bm25', contextBudgetChars: 80_000, structured: false },
  reorganizeTopics: { effort: 'high', maxTokens: 32_000, context: 'section-leads', contextBudgetChars: 60_000, structured: true },
  updateToc: { effort: 'medium', maxTokens: 32_000, context: 'section-leads', contextBudgetChars: 30_000, structured: true },
  checkReferences: { effort: 'medium', maxTokens: 32_000, context: 'bm25', contextBudgetChars: 0, structured: true },
};
