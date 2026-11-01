/** Tipos de scripts/ai-models-catalog.mjs, para os testes unitários. */
export const SOURCE: string;

export function buildCatalog(
  api: unknown,
  now?: Date,
): {
  generatedAt: string;
  source: string;
  providers: Record<string, { id: string; label: string | null; released: number | null }[]>;
};
