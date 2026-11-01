/**
 * Índice (marcadores) do PDF: a hierarquia que o hyperref grava a partir de
 * \chapter, \section etc. Cada item vira página e posição (fração da altura,
 * 0 no topo), para rolar até ele e saber qual seção está na tela.
 */
import type { PDFDocumentProxy } from 'pdfjs-dist';

export interface PdfOutlineItem {
  /** Caminho na árvore ("0", "0.2", "0.2.1"): estável enquanto o PDF não muda. */
  id: string;
  title: string;
  /** Nulo quando o destino não é uma página deste PDF (link externo, destino quebrado). */
  page: number | null;
  /** Fração da altura da página, 0 no topo; nula quando o destino não diz a altura. */
  y: number | null;
  children: PdfOutlineItem[];
}

export interface PdfOutlinePosition {
  page: number;
  y: number;
}

/**
 * Altura do destino como fração da página, 0 no topo. O PDF mede de baixo
 * para cima a partir da caixa da página (`view` = [x0, y0, x1, y1]); só XYZ,
 * FitH, FitBH e FitR dizem a altura.
 */
export function destinationTop(kind: string | undefined, args: readonly unknown[], view: readonly number[]): number | null {
  const top = kind === 'XYZ' ? args[1] : kind === 'FitH' || kind === 'FitBH' ? args[0] : kind === 'FitR' ? args[3] : null;
  const [, y0 = 0, , y1 = 0] = view;
  const height = y1 - y0;
  if (typeof top !== 'number' || !Number.isFinite(top) || height <= 0) return null;
  return Math.min(1, Math.max(0, (y1 - top) / height));
}

/** Compara posições no documento: página e depois altura (sem altura, o topo da página). */
function compare(a: PdfOutlinePosition, b: PdfOutlinePosition): number {
  return a.page !== b.page ? a.page - b.page : a.y - b.y;
}

/** Itens com destino, na ordem do índice, com o pai de cada um. */
export function flattenOutline(items: readonly PdfOutlineItem[]): { entries: Array<PdfOutlinePosition & { id: string }>; parents: Map<string, string | null> } {
  const entries: Array<PdfOutlinePosition & { id: string }> = [];
  const parents = new Map<string, string | null>();
  const walk = (list: readonly PdfOutlineItem[], parent: string | null) => {
    for (const item of list) {
      parents.set(item.id, parent);
      if (item.page !== null) entries.push({ id: item.id, page: item.page, y: item.y ?? 0 });
      walk(item.children, item.id);
    }
  };
  walk(items, null);
  return { entries, parents };
}

/**
 * Seção atual: a última, na ordem do documento, que começa antes da posição
 * lida na tela. Empate de posição fica com a que vem depois no índice (a
 * subseção que abre junto com o capítulo). Antes da primeira seção, nenhuma.
 */
export function activeOutlineId(entries: ReadonlyArray<PdfOutlinePosition & { id: string }>, position: PdfOutlinePosition): string | null {
  let best: (PdfOutlinePosition & { id: string }) | null = null;
  for (const entry of entries) {
    if (compare(entry, position) > 0) continue;
    if (!best || compare(entry, best) >= 0) best = entry;
  }
  return best?.id ?? null;
}

/** Pais de um item, do mais próximo ao da raiz. */
export function ancestorIds(id: string, parents: ReadonlyMap<string, string | null>): string[] {
  const chain: string[] = [];
  let current = parents.get(id) ?? null;
  while (current !== null) {
    chain.push(current);
    current = parents.get(current) ?? null;
  }
  return chain;
}

interface RawOutlineNode {
  title: string;
  dest: string | unknown[] | null;
  items: RawOutlineNode[];
}

/** Lê o índice do PDF e resolve cada destino (nomeado ou explícito) para página e altura. */
export async function loadPdfOutline(doc: PDFDocumentProxy): Promise<PdfOutlineItem[]> {
  const raw = ((await doc.getOutline()) ?? []) as RawOutlineNode[];
  const views = new Map<number, number[]>();
  const viewOf = async (page: number) => {
    if (!views.has(page)) views.set(page, (await doc.getPage(page)).view);
    return views.get(page)!;
  };

  const resolve = async (dest: RawOutlineNode['dest']): Promise<{ page: number | null; y: number | null }> => {
    try {
      const explicit = typeof dest === 'string' ? await doc.getDestination(dest) : dest;
      if (!Array.isArray(explicit) || explicit.length === 0) return { page: null, y: null };
      const [ref, kind, ...args] = explicit as [unknown, { name?: string } | undefined, ...unknown[]];
      const index = typeof ref === 'number' ? ref : await doc.getPageIndex(ref as Parameters<PDFDocumentProxy['getPageIndex']>[0]);
      const page = index + 1;
      if (page < 1 || page > doc.numPages) return { page: null, y: null };
      return { page, y: destinationTop(kind?.name, args, await viewOf(page)) };
    } catch {
      return { page: null, y: null };
    }
  };

  const build = async (nodes: readonly RawOutlineNode[], prefix: string): Promise<PdfOutlineItem[]> =>
    Promise.all(
      nodes.map(async (node, index) => {
        const id = prefix ? `${prefix}.${index}` : String(index);
        const target = await resolve(node.dest);
        return { id, title: node.title.trim(), ...target, children: await build(node.items ?? [], id) };
      }),
    );

  return build(raw, '');
}
