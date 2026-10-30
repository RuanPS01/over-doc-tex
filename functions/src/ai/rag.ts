/**
 * RAG lexical: fatia o LaTeX em blocos lógicos e ranqueia por BM25.
 * Sem embeddings nem banco vetorial: é determinístico, barato e suficiente
 * para projetos de tese ou artigo (centenas de blocos).
 */
import type { SourceFile } from './sources';

export interface Chunk {
  fileId: string;
  path: string;
  startLine: number;
  endLine: number;
  text: string;
  tokens: string[];
}

export interface RankedChunk {
  chunk: Chunk;
  score: number;
}

export interface OutlineEntry {
  level: string;
  title: string;
  path: string;
  line: number;
}

const MAX_CHUNK_CHARS = 1_500;
const SECTION_RE =
  /^\s*\\(part|chapter|section|subsection|subsubsection|paragraph)\*?\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/;

const STOPWORDS = new Set([
  'a', 'o', 'as', 'os', 'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'no', 'na', 'nos', 'nas',
  'um', 'uma', 'para', 'por', 'com', 'que', 'se', 'ao', 'aos', 'como', 'mais', 'ou', 'sua', 'seu',
  'the', 'of', 'and', 'to', 'in', 'is', 'for', 'on', 'with', 'by', 'an', 'be', 'this', 'that',
]);

/** Normaliza texto LaTeX em termos de busca (sem acentos, sem comandos). */
export function tokenize(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\\[a-z]+\*?/g, ' ')
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length >= 2 && !STOPWORDS.has(term));
}

/**
 * Fatia um arquivo em blocos: um bloco novo começa em comando de seção,
 * em entrada BibTeX ou em fim de parágrafo, e é cortado ao exceder o limite.
 */
export function chunkSource(file: SourceFile): Chunk[] {
  const lines = file.content.split(/\r?\n/);
  const chunks: Chunk[] = [];
  let buffer: string[] = [];
  let bufferChars = 0;
  let startLine = 1;

  const flush = (endLine: number) => {
    const text = buffer.join('\n').trim();
    if (text) {
      chunks.push({ fileId: file.fileId, path: file.path, startLine, endLine, text, tokens: tokenize(text) });
    }
    buffer = [];
    bufferChars = 0;
  };

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const startsBlock =
      SECTION_RE.test(line) ||
      (file.kind === 'bib' && line.trimStart().startsWith('@')) ||
      (line.trim() === '' && bufferChars > MAX_CHUNK_CHARS / 3);

    if (startsBlock && buffer.length > 0) flush(lineNumber - 1);
    if (buffer.length === 0) startLine = lineNumber;

    buffer.push(line);
    bufferChars += line.length + 1;
    if (bufferChars >= MAX_CHUNK_CHARS) flush(lineNumber);
  });
  flush(lines.length);
  return chunks;
}

/** Ranqueia blocos com BM25 (k1 = 1.2, b = 0.75). */
export function rankChunks(query: string, chunks: readonly Chunk[]): RankedChunk[] {
  const queryTerms = [...new Set(tokenize(query))];
  if (queryTerms.length === 0 || chunks.length === 0) return [];

  const k1 = 1.2;
  const b = 0.75;
  const avgLength = chunks.reduce((sum, chunk) => sum + chunk.tokens.length, 0) / chunks.length || 1;
  const documentFrequency = new Map<string, number>();
  for (const chunk of chunks) {
    for (const term of new Set(chunk.tokens)) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }

  return chunks
    .map((chunk) => {
      const termFrequency = new Map<string, number>();
      for (const term of chunk.tokens) termFrequency.set(term, (termFrequency.get(term) ?? 0) + 1);

      let score = 0;
      for (const term of queryTerms) {
        const tf = termFrequency.get(term) ?? 0;
        if (tf === 0) continue;
        const df = documentFrequency.get(term) ?? 0;
        const idf = Math.log(1 + (chunks.length - df + 0.5) / (df + 0.5));
        score += idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * chunk.tokens.length) / avgLength)));
      }
      return { chunk, score };
    })
    .filter((ranked) => ranked.score > 0)
    .sort((a, b2) => b2.score - a.score);
}

/**
 * Escolhe os melhores blocos dentro do orçamento de caracteres e os devolve
 * na ordem de leitura do documento (arquivo e linha), não na ordem de score.
 */
export function selectWithinBudget(ranked: readonly RankedChunk[], budgetChars: number): RankedChunk[] {
  const selected: RankedChunk[] = [];
  let used = 0;
  for (const item of ranked) {
    if (used + item.chunk.text.length > budgetChars) continue;
    selected.push(item);
    used += item.chunk.text.length;
  }
  return selected.sort(
    (a, b) => a.chunk.path.localeCompare(b.chunk.path) || a.chunk.startLine - b.chunk.startLine,
  );
}

/** Extrai a hierarquia de seções de todos os arquivos .tex. */
export function buildOutline(files: readonly SourceFile[]): OutlineEntry[] {
  return files
    .filter((file) => file.kind === 'tex')
    .flatMap((file) =>
      file.content.split(/\r?\n/).flatMap((line, index) => {
        const match = SECTION_RE.exec(line);
        if (!match?.[1]) return [];
        return [{ level: match[1], title: (match[2] ?? '').trim(), path: file.path, line: index + 1 }];
      }),
    );
}

/** Para tarefas de estrutura: o bloco de abertura de cada seção, até o orçamento. */
export function selectSectionLeads(chunks: readonly Chunk[], budgetChars: number): RankedChunk[] {
  const leads = chunks
    .filter((chunk) => SECTION_RE.test(chunk.text.split('\n')[0] ?? ''))
    .map((chunk) => ({ chunk, score: 1 }));
  return selectWithinBudget(leads, budgetChars);
}
