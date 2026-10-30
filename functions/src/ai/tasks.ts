import type { AiTask } from '@shared/ai/schemas';
import type { ProjectRole } from '@shared/firestore/types';

export type Effort = 'low' | 'medium' | 'high';

export interface TaskConfig {
  /** Profundidade de raciocínio do modelo (output_config.effort). */
  effort: Effort;
  maxTokens: number;
  /** Como montar o contexto: ranking BM25 pela pergunta ou abertura de cada seção. */
  context: 'bm25' | 'section-leads';
  contextBudgetChars: number;
  /** Papéis com permissão para executar a tarefa. */
  roles: readonly ProjectRole[];
}

const WRITERS: readonly ProjectRole[] = ['owner', 'editor'];
const EVERYONE: readonly ProjectRole[] = ['owner', 'editor', 'viewer'];

/** Registro central das tarefas: adicionar uma tarefa começa aqui e em prompts.ts. */
export const TASKS: Record<AiTask, TaskConfig> = {
  chat: { effort: 'low', maxTokens: 16_000, context: 'bm25', contextBudgetChars: 40_000, roles: EVERYONE },
  rewriteText: { effort: 'medium', maxTokens: 16_000, context: 'bm25', contextBudgetChars: 20_000, roles: WRITERS },
  paraphrase: { effort: 'low', maxTokens: 16_000, context: 'bm25', contextBudgetChars: 12_000, roles: WRITERS },
  generateDraft: { effort: 'high', maxTokens: 64_000, context: 'bm25', contextBudgetChars: 80_000, roles: WRITERS },
  reorganizeTopics: { effort: 'high', maxTokens: 32_000, context: 'section-leads', contextBudgetChars: 60_000, roles: WRITERS },
  updateToc: { effort: 'medium', maxTokens: 32_000, context: 'section-leads', contextBudgetChars: 30_000, roles: WRITERS },
  checkReferences: { effort: 'medium', maxTokens: 32_000, context: 'bm25', contextBudgetChars: 0, roles: EVERYONE },
};
