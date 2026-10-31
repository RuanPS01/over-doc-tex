/**
 * Compila o diff visual no navegador (o mesmo Siglum da compilação) com a
 * escada de degradação de docs/07-fluxos.md: por palavra; se falhar, por
 * parágrafo; se falhar de novo, sem PDF (a tela mostra o diff de texto).
 */
import type { DiffChangeMarker, DiffGranularity } from '@shared/firestore/types';
import { compileLatex } from '@/lib/latex/compiler';
import { buildCompileInput, type TexIssue } from '@/lib/latex/prepare';
import { loadPdfjs } from '@/lib/pdf/pdfjs';
import { buildDiffDocument, flattenLatex, type AnnotatedDiff, type DiffLevel } from './latex-diff';

/** Arquivo de uma das árvores: texto ou binário. */
export type DiffTreeFile = { text: string } | { data: Uint8Array };

export interface VisualDiffResult {
  pdf: Uint8Array | null;
  granularity: DiffGranularity;
  changes: DiffChangeMarker[];
  stats: AnnotatedDiff['stats'];
  /** Erros do TeX da última tentativa, quando nenhum nível compilou. */
  issues: TexIssue[];
}

const texts = (tree: ReadonlyMap<string, DiffTreeFile>) =>
  new Map([...tree].flatMap(([path, file]) => ('text' in file ? [[path, file.text] as const] : [])));

/** Página e altura (0 a 1, de cima para baixo) de cada \DIFmark, lidas dos destinos nomeados do PDF. */
async function locateChanges(pdf: Uint8Array, changes: AnnotatedDiff['changes']): Promise<DiffChangeMarker[]> {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({ data: pdf.slice() });
  try {
    const doc = await task.promise;
    // O pdf.js 6 devolve um Map; versões antigas, um objeto.
    const raw: unknown = await doc.getDestinations();
    const destinationOf = (name: string): unknown[] | undefined =>
      raw instanceof Map ? (raw.get(name) as unknown[] | undefined) : ((raw as Record<string, unknown[] | undefined> | null)?.[name] ?? undefined);
    const heights = new Map<number, number>();
    const markers: DiffChangeMarker[] = [];
    for (const change of changes) {
      const destination = destinationOf(`DIF${change.id}`);
      if (!destination) continue;
      const pageIndex = await doc.getPageIndex(destination[0] as Parameters<typeof doc.getPageIndex>[0]);
      if (!heights.has(pageIndex)) heights.set(pageIndex, (await doc.getPage(pageIndex + 1)).getViewport({ scale: 1 }).height);
      const top = typeof destination[3] === 'number' ? destination[3] : 0;
      markers.push({
        id: `d${change.id}`,
        kind: change.kind,
        page: pageIndex + 1,
        y: Math.min(1, Math.max(0, 1 - top / heights.get(pageIndex)!)),
        preview: change.preview,
      });
    }
    return markers.sort((a, b) => a.page - b.page || a.y - b.y);
  } finally {
    void task.destroy();
  }
}

export async function compileVisualDiff(
  base: ReadonlyMap<string, DiffTreeFile>,
  target: ReadonlyMap<string, DiffTreeFile>,
  rootPath: string,
): Promise<VisualDiffResult> {
  const baseSource = flattenLatex(texts(base), rootPath);
  const targetTexts = texts(target);
  const targetSource = flattenLatex(targetTexts, rootPath);
  const binaries = new Map([...target].flatMap(([path, file]) => ('data' in file ? [[path, file.data] as const] : [])));
  let issues: TexIssue[] = [];
  let stats: AnnotatedDiff['stats'] = { insertedWords: 0, deletedWords: 0, changedBlocks: 0 };

  for (const level of ['word', 'paragraph'] as DiffLevel[]) {
    const annotated = buildDiffDocument(baseSource, targetSource, level);
    if (!annotated) break;
    stats = annotated.stats;
    // O .tex achatado substitui o principal; os demais arquivos da versão nova vão junto (figuras, .bib, .sty).
    const files = [...targetTexts].map(([path, content]) => ({ path, content: path === rootPath ? annotated.source : content }));
    const compiled = await compileLatex(buildCompileInput(rootPath, files, binaries), rootPath, () => undefined);
    if (compiled.pdf) {
      return { pdf: compiled.pdf, granularity: level, changes: await locateChanges(compiled.pdf, annotated.changes), stats, issues: [] };
    }
    issues = compiled.issues;
  }
  return { pdf: null, granularity: 'text-only', changes: [], stats, issues };
}
