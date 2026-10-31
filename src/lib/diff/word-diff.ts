/**
 * Diff de texto por palavra (puro, sem I/O). Primeiro alinha as linhas
 * (Myers); depois, em cada trecho alterado, compara palavra por palavra e
 * limpa o resultado para não picotar o texto (docs/07-fluxos.md, passo 6).
 * É a granularidade "text-only" da escada de degradação do diff.
 */

export type DiffOp = 'equal' | 'insert' | 'delete';

export interface DiffSegment {
  op: DiffOp;
  text: string;
}

export interface DiffStats {
  insertedWords: number;
  deletedWords: number;
}

/**
 * Teto de edições do Myers. A memória cresce com o quadrado das edições;
 * acima disso o trecho inteiro vira remoção mais inserção.
 */
const MAX_EDITS = 2000;
/** Igualdades menores que isso entre duas edições são absorvidas por elas. */
const MIN_KEPT_EQUAL_TOKENS = 3;
/** Mais que isso alterado num trecho: mostra o trecho antigo inteiro e o novo inteiro. */
const REWRITE_RATIO = 0.6;

type Step = 'equal' | 'insert' | 'delete';

/**
 * Sequência mínima de passos (Myers, O((N+M)D)) para transformar `a` em `b`.
 * Nulo quando passa de MAX_EDITS.
 */
export function editSteps<T>(a: readonly T[], b: readonly T[]): Step[] | null {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  const offset = max + 1;
  const v = new Int32Array(2 * max + 3);
  // Cada rodada guarda só a janela [-d, d] de V: memória proporcional a D².
  const trace: Int32Array[] = [];

  for (let d = 0; d <= max; d++) {
    if (d > MAX_EDITS) return null;
    trace.push(v.slice(offset - d, offset + d + 1));
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[offset + k - 1]! < v[offset + k + 1]!) ? v[offset + k + 1]! : v[offset + k - 1]! + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) return backtrack(trace, n, m);
    }
  }
  return null;
}

function backtrack(trace: Int32Array[], n: number, m: number): Step[] {
  const steps: Step[] = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d >= 0; d--) {
    const window = trace[d]!;
    const at = (k: number) => window[k + d]!;
    const k = x - y;
    const prevK = k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1;
    const prevX = d === 0 ? 0 : at(prevK);
    const prevY = d === 0 ? 0 : prevX - prevK;
    while (x > prevX && y > prevY) {
      steps.push('equal');
      x--;
      y--;
    }
    if (d > 0) steps.push(x === prevX ? 'insert' : 'delete');
    x = prevX;
    y = prevY;
  }
  return steps.reverse();
}

/** Comandos LaTeX, palavras, espaços e cada pontuação viram tokens próprios. */
export function tokenize(text: string): string[] {
  return text.match(/\\[A-Za-z@]+\*?|\\.|[\p{L}\p{M}\p{N}_]+|[^\S\n]+|\n|[^\s]/gu) ?? [];
}

function splitLines(text: string): string[] {
  return text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
}

/** Junta segmentos vizinhos com a mesma operação e descarta os vazios. */
function compact(segments: readonly DiffSegment[]): DiffSegment[] {
  const out: DiffSegment[] = [];
  for (const segment of segments) {
    if (!segment.text) continue;
    const last = out.at(-1);
    if (last && last.op === segment.op) last.text += segment.text;
    else out.push({ ...segment });
  }
  return out;
}

function stepsToSegments(a: readonly string[], b: readonly string[], steps: readonly Step[]): DiffSegment[] {
  const segments: DiffSegment[] = [];
  let i = 0;
  let j = 0;
  for (const step of steps) {
    if (step === 'equal') {
      segments.push({ op: 'equal', text: a[i]! });
      i++;
      j++;
    } else if (step === 'delete') segments.push({ op: 'delete', text: a[i++]! });
    else segments.push({ op: 'insert', text: b[j++]! });
  }
  return segments;
}

/**
 * Deixa cada região alterada como "removido, depois inserido" e absorve
 * igualdades curtas entre edições, que só picotariam a leitura.
 */
function cleanup(segments: readonly DiffSegment[]): DiffSegment[] {
  const items = compact(segments);
  const out: DiffSegment[] = [];
  let deleted = '';
  let inserted = '';
  const flush = () => {
    if (deleted) out.push({ op: 'delete', text: deleted });
    if (inserted) out.push({ op: 'insert', text: inserted });
    deleted = '';
    inserted = '';
  };
  const nextRegionOps = (from: number) => {
    const ops = new Set<DiffOp>();
    for (let index = from; index < items.length && items[index]!.op !== 'equal'; index++) ops.add(items[index]!.op);
    return ops;
  };
  items.forEach((segment, index) => {
    if (segment.op === 'delete') deleted += segment.text;
    else if (segment.op === 'insert') inserted += segment.text;
    else {
      // Só vale absorver se a região resultante já teria remoção e inserção:
      // em inserção pura, a palavra igual no meio continua igual.
      const after = nextRegionOps(index + 1);
      const between = (deleted || inserted) && after.size > 0;
      const mixes = (Boolean(deleted) || after.has('delete')) && (Boolean(inserted) || after.has('insert'));
      const isShort = tokenize(segment.text).filter((token) => token.trim()).length < MIN_KEPT_EQUAL_TOKENS;
      if (between && mixes && isShort && !segment.text.includes('\n')) {
        deleted += segment.text;
        inserted += segment.text;
      } else {
        flush();
        out.push(segment);
      }
    }
  });
  flush();
  return compact(out);
}

/** Diff palavra por palavra de um trecho (já sabido como alterado). */
export function diffWords(before: string, after: string): DiffSegment[] {
  if (!before || !after) return compact([{ op: 'delete', text: before }, { op: 'insert', text: after }]);
  const a = tokenize(before);
  const b = tokenize(after);
  // Início e fim iguais ficam fora da conta de "reescrito": uma linha vazia
  // que virou texto continua sendo só uma inserção.
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  let suffix = 0;
  while (suffix < a.length - prefix && suffix < b.length - prefix && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix++;
  const head: DiffSegment = { op: 'equal', text: a.slice(0, prefix).join('') };
  const tail: DiffSegment = { op: 'equal', text: a.slice(a.length - suffix).join('') };
  const middleA = a.slice(prefix, a.length - suffix);
  const middleB = b.slice(prefix, b.length - suffix);

  const steps = editSteps(middleA, middleB);
  const equalCount = prefix + suffix + (steps?.filter((step) => step === 'equal').length ?? 0);
  if (!steps || equalCount < (1 - REWRITE_RATIO) * Math.max(a.length, b.length)) {
    return compact([head, { op: 'delete', text: middleA.join('') }, { op: 'insert', text: middleB.join('') }, tail]);
  }
  return compact([head, ...cleanup(stepsToSegments(middleA, middleB, steps)), tail]);
}

/** Diff de dois textos: linhas iguais ficam inteiras, trechos alterados são comparados por palavra. */
export function diffText(before: string, after: string): DiffSegment[] {
  if (before === after) return before ? [{ op: 'equal', text: before }] : [];
  const a = splitLines(before);
  const b = splitLines(after);
  const steps = editSteps(a, b);
  if (!steps) return diffWords(before, after);

  const out: DiffSegment[] = [];
  let i = 0;
  let j = 0;
  let removed = '';
  let added = '';
  const flushHunk = () => {
    if (removed || added) out.push(...diffWords(removed, added));
    removed = '';
    added = '';
  };
  for (const step of steps) {
    if (step === 'equal') {
      flushHunk();
      out.push({ op: 'equal', text: a[i]! });
      i++;
      j++;
    } else if (step === 'delete') removed += a[i++]!;
    else added += b[j++]!;
  }
  flushHunk();
  return compact(out);
}

const WORD = /[\p{L}\p{N}]/u;

export function diffStats(segments: readonly DiffSegment[]): DiffStats {
  const count = (text: string) => tokenize(text).filter((token) => WORD.test(token)).length;
  return segments.reduce<DiffStats>(
    (stats, segment) => {
      if (segment.op === 'insert') stats.insertedWords += count(segment.text);
      if (segment.op === 'delete') stats.deletedWords += count(segment.text);
      return stats;
    },
    { insertedWords: 0, deletedWords: 0 },
  );
}

export type DiffRow =
  | { kind: 'line'; /** Linha no texto novo; nulo para linha que só existia no antigo. */ number: number | null; parts: DiffSegment[] }
  | { kind: 'skip'; count: number };

/**
 * Linhas para exibir: as alteradas e `context` linhas em volta; as demais
 * viram um aviso de "N linhas sem alteração".
 */
export function toDiffRows(segments: readonly DiffSegment[], context = 2): DiffRow[] {
  const lines: Array<{ parts: DiffSegment[]; changed: boolean; number: number | null }> = [];
  let current: DiffSegment[] = [];
  let afterLine = 1;
  // A quebra que fecha a linha também conta: linha vazia inserida existe no texto novo.
  const endLine = (newline: DiffOp | null) => {
    const hasAfter = current.some((part) => part.op !== 'delete') || (newline !== null && newline !== 'delete');
    lines.push({
      parts: current,
      changed: current.some((part) => part.op !== 'equal') || (newline !== null && newline !== 'equal'),
      number: hasAfter ? afterLine : null,
    });
    current = [];
  };
  for (const segment of segments) {
    const pieces = segment.text.split('\n');
    pieces.forEach((piece, index) => {
      if (piece) current.push({ op: segment.op, text: piece });
      if (index < pieces.length - 1) {
        endLine(segment.op);
        if (segment.op !== 'delete') afterLine++;
      }
    });
  }
  if (current.length > 0) endLine(null);

  const visible = lines.map(() => false);
  lines.forEach((line, index) => {
    if (!line.changed) return;
    for (let near = Math.max(0, index - context); near <= Math.min(lines.length - 1, index + context); near++) visible[near] = true;
  });

  const rows: DiffRow[] = [];
  lines.forEach((line, index) => {
    if (visible[index]) {
      rows.push({ kind: 'line', number: line.number, parts: line.parts });
      return;
    }
    const last = rows.at(-1);
    if (last?.kind === 'skip') last.count++;
    else rows.push({ kind: 'skip', count: 1 });
  });
  return rows;
}

/**
 * Prepara o texto extraído do PDF para o diff: junta palavras hifenizadas na
 * quebra de linha, desfaz as quebras de linha do PDF (que mudam com qualquer
 * reflow) e põe uma frase por linha, para o alinhamento por linha funcionar.
 * Páginas ficam separadas por uma linha em branco.
 */
export function normalizePdfText(pages: readonly string[]): string {
  return pages
    .map((page) =>
      page
        .replace(/(\p{L})-\n(\p{Ll})/gu, '$1$2')
        .replace(/\s+/g, ' ')
        .trim()
        .split(/(?<=[.!?:;])\s+(?=[\p{Lu}\d(])/u)
        .join('\n'),
    )
    .filter(Boolean)
    .join('\n\n');
}
