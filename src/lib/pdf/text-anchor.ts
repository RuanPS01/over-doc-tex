import type { NormalizedRect, TextAnchor } from '@shared/firestore/types';

/** Contexto guardado antes e depois da citação (seletor no estilo TextQuoteSelector). */
const CONTEXT_CHARS = 32;
export const MAX_QUOTE_CHARS = 2000;
const MAX_RECTS = 100;

/** Espaços colapsados, para comparar a seleção do navegador com o texto da página. */
export function collapseSpaces(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Acha a citação no texto da página (o mesmo do `.pages` da versão) e devolve
 * citação, contexto e posição. Espaços e quebras de linha não precisam bater:
 * a seleção do navegador e o pdf.js separam linhas de jeitos diferentes.
 */
export function buildQuote(pageText: string, selected: string): Pick<TextAnchor, 'quote' | 'position'> | null {
  const exact = collapseSpaces(selected).slice(0, MAX_QUOTE_CHARS);
  if (!exact) return null;
  const pattern = new RegExp(
    exact
      .split(' ')
      .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('\\s*'),
    'u',
  );
  const match = pattern.exec(pageText);
  if (!match) return { quote: { exact, prefix: '', suffix: '' }, position: { start: 0, end: 0 } };
  const start = match.index;
  const end = start + match[0].length;
  return {
    quote: {
      exact,
      prefix: collapseSpaces(pageText.slice(Math.max(0, start - CONTEXT_CHARS * 2), start)).slice(-CONTEXT_CHARS),
      suffix: collapseSpaces(pageText.slice(end, end + CONTEXT_CHARS * 2)).slice(0, CONTEXT_CHARS),
    },
    position: { start, end },
  };
}

const round = (value: number) => Math.round(Math.min(1, Math.max(0, value)) * 10_000) / 10_000;

/**
 * Retângulos da seleção (em pixels da tela) viram retângulos normalizados na
 * página, juntando os pedaços da mesma linha.
 */
export function normalizeRects(
  rects: ReadonlyArray<{ left: number; top: number; width: number; height: number }>,
  page: { left: number; top: number; width: number; height: number },
): NormalizedRect[] {
  const lines: NormalizedRect[] = [];
  const sorted = rects
    .filter((rect) => rect.width > 1 && rect.height > 1)
    .map((rect) => ({ x: (rect.left - page.left) / page.width, y: (rect.top - page.top) / page.height, width: rect.width / page.width, height: rect.height / page.height }))
    .sort((a, b) => a.y - b.y || a.x - b.x);
  for (const rect of sorted) {
    const last = lines.at(-1);
    const sameLine = last && Math.abs(last.y - rect.y) < last.height / 2 && rect.x <= last.x + last.width + 0.02;
    if (last && sameLine) {
      const right = Math.max(last.x + last.width, rect.x + rect.width);
      last.x = Math.min(last.x, rect.x);
      last.width = right - last.x;
      last.height = Math.max(last.height, rect.height);
    } else lines.push({ ...rect });
  }
  return lines.slice(0, MAX_RECTS).map((rect) => ({ x: round(rect.x), y: round(rect.y), width: round(rect.width), height: round(rect.height) }));
}
