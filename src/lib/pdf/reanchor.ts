import type { TextAnchor } from '@shared/firestore/types';
import { collapseSpaces, quotePattern } from './text-anchor';

export interface QuoteMatch {
  page: number;
  start: number;
  end: number;
}

/** Quantos caracteres do fim de `a` coincidem com o fim de `b` (ou do começo, com `fromStart`). */
function overlap(a: string, b: string, fromStart: boolean): number {
  let count = 0;
  const max = Math.min(a.length, b.length);
  while (count < max && (fromStart ? a[count] === b[count] : a[a.length - 1 - count] === b[b.length - 1 - count])) count++;
  return count;
}

/**
 * Reancora uma citação na versão nova (docs/07-fluxos.md, "Reancoragem"):
 * 1. a mesma posição, se o texto ali ainda for a citação;
 * 2. a citação na mesma página ou nas vizinhas, escolhendo a ocorrência cujo
 *    contexto (prefixo e sufixo) mais se parece com o guardado;
 * 3. com pequenas diferenças: as três primeiras e as três últimas palavras.
 * Nulo quando não acha (a thread vira "desatualizada").
 */
export function reanchorQuote(pages: readonly string[], anchor: Pick<TextAnchor, 'page' | 'quote' | 'position'>): QuoteMatch | null {
  const exact = collapseSpaces(anchor.quote.exact);
  if (!exact) return null;
  const same = pages[anchor.page - 1];
  if (same !== undefined && collapseSpaces(same.slice(anchor.position.start, anchor.position.end)) === exact) {
    return { page: anchor.page, start: anchor.position.start, end: anchor.position.end };
  }

  const candidates = [anchor.page, anchor.page - 1, anchor.page + 1].filter((page) => page >= 1 && page <= pages.length);
  let best: (QuoteMatch & { score: number }) | null = null;
  for (const page of candidates) {
    const text = pages[page - 1]!;
    for (const match of text.matchAll(quotePattern(exact, 'gu'))) {
      const start = match.index;
      const end = start + match[0].length;
      const score =
        overlap(collapseSpaces(text.slice(Math.max(0, start - 64), start)), anchor.quote.prefix, false) +
        overlap(collapseSpaces(text.slice(end, end + 64)), anchor.quote.suffix, true) -
        (page === anchor.page ? 0 : 8);
      if (!best || score > best.score) best = { page, start, end, score };
    }
  }
  if (best) return { page: best.page, start: best.start, end: best.end };

  const words = exact.split(' ');
  if (words.length < 6) return null;
  const head = quotePattern(words.slice(0, 3).join(' '), 'u');
  const tail = quotePattern(words.slice(-3).join(' '), 'gu');
  for (const page of candidates) {
    const text = pages[page - 1]!;
    const startMatch = head.exec(text);
    if (!startMatch) continue;
    tail.lastIndex = startMatch.index;
    const endMatch = tail.exec(text);
    if (endMatch && endMatch.index + endMatch[0].length - startMatch.index <= exact.length * 1.5) {
      return { page, start: startMatch.index, end: endMatch.index + endMatch[0].length };
    }
  }
  return null;
}
