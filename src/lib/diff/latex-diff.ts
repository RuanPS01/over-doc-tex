/**
 * Diff visual (puro): monta um .tex com as alterações marcadas, que depois é
 * compilado no navegador (docs/07-fluxos.md, cenário C). Passos:
 * 1. achatar \input, \include e \subfile das duas árvores;
 * 2. separar preâmbulo e corpo, tirando os comentários;
 * 3. dividir o corpo em blocos balanceados (parágrafos fora de ambientes e chaves);
 * 4. alinhar os blocos (Myers) e, nos blocos alterados, comparar palavra por
 *    palavra, com comandos, chaves e matemática como unidades atômicas; em
 *    comandos de texto (\emph, \section, \footnote...) que só mudaram o
 *    argumento, o diff entra no argumento;
 * 5. emitir \DIFadd e \DIFdel no texto, \DIFaddatom e \DIFdelatom nos átomos e
 *    ambientes inteiros em DIFaddenv e DIFdelenv, neutralizando o que foi
 *    removido (\label sai, seção vira \DIFdelsection, float vira aviso).
 * Cada alteração ganha \DIFmark{n}: um destino nomeado do PDF que o pdf.js lê
 * para a navegação "Próxima alteração".
 */
import { editSteps } from './word-diff';

/** Entra na chave do cache: mudou a saída do motor, muda a versão. */
export const DIFF_ENGINE_VERSION = 'diff-1.1.0';
export type DiffLevel = 'word' | 'paragraph';

const MAX_DEPTH = 20;
const MAX_CHANGES = 500;
/** Mais que isso alterado num bloco: mostra o bloco antigo inteiro e o novo inteiro. */
const REWRITE_RATIO = 0.6;
const PAIR_SIMILARITY = 0.5;

const VERBATIM_ENVIRONMENTS = new Set(['verbatim', 'verbatim*', 'Verbatim', 'lstlisting', 'minted', 'comment']);
const FLOAT_ENVIRONMENTS = /\\begin\{(figure\*?|table\*?)\}[\s\S]*?\\end\{\1\}/g;
const SECTIONING = /^\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\*?/;

/** Tira comentários (% não escapado até o fim da linha), mantendo a quebra de linha. */
export function stripComments(text: string): string {
  return text.replace(/(^|[^\\])((?:\\\\)*)%.*$/gm, '$1$2');
}

function normalizePath(path: string): string {
  const parts: string[] = [];
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return parts.join('/');
}

/** Expande \input, \include e \subfile a partir do arquivo raiz (profundidade 20, sem ciclos). */
export function flattenLatex(tree: ReadonlyMap<string, string>, rootPath: string): string {
  const folder = rootPath.includes('/') ? rootPath.slice(0, rootPath.lastIndexOf('/') + 1) : '';
  const expand = (text: string, depth: number, stack: readonly string[]): string =>
    stripComments(text).replace(/\\(input|include|subfile)\s*\{([^}]+)\}/g, (match, command: string, rawName: string) => {
      if (depth >= MAX_DEPTH) return match;
      const name = rawName.trim();
      const path = [name, `${name}.tex`].map((candidate) => normalizePath(folder + candidate)).find((candidate) => tree.has(candidate));
      if (!path || stack.includes(path)) return match;
      let content = expand(tree.get(path)!, depth + 1, [...stack, path]);
      // \subfile traz um documento completo: só o corpo entra.
      const split = splitDocument(content);
      if (split) content = split.body;
      return command === 'include' ? `\\clearpage\n${content}\n\\clearpage\n` : content;
    });
  return expand(tree.get(rootPath) ?? '', 0, [rootPath]);
}

export interface DocumentParts {
  preamble: string;
  body: string;
  tail: string;
}

export function splitDocument(source: string): DocumentParts | null {
  const begin = source.indexOf('\\begin{document}');
  const end = source.lastIndexOf('\\end{document}');
  if (begin === -1 || end === -1 || end < begin) return null;
  return { preamble: source.slice(0, begin), body: source.slice(begin + '\\begin{document}'.length, end), tail: source.slice(end) };
}

/** Posição logo depois do grupo balanceado que abre em `open` (`{` ou `[`); -1 se não fecha. */
function groupEnd(text: string, open: number): number {
  const opener = text[open];
  const closer = opener === '[' ? ']' : '}';
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const char = text[i];
    if (char === '\\') {
      i++;
      continue;
    }
    if (char === '{' || (opener === '[' && char === '[')) depth++;
    else if (char === '}' || (opener === '[' && char === ']')) {
      depth--;
      if (depth === 0 && char === closer) return i + 1;
    }
  }
  return -1;
}

/**
 * Divide o corpo em blocos: parágrafos separados por linha em branco, mas só
 * fora de ambientes e de chaves. Assim cada bloco é balanceado e pode ser
 * envolvido num grupo sem quebrar o documento.
 */
export function segmentUnits(body: string): string[] {
  const units: string[] = [];
  let start = 0;
  let envDepth = 0;
  let braceDepth = 0;
  for (let i = 0; i < body.length; i++) {
    const char = body[i];
    if (char === '\\') {
      const begin = body.startsWith('\\begin{', i);
      const end = body.startsWith('\\end{', i);
      if (begin || end) {
        const close = body.indexOf('}', i);
        const name = body.slice(body.indexOf('{', i) + 1, close);
        if (begin && VERBATIM_ENVIRONMENTS.has(name)) {
          const finish = body.indexOf(`\\end{${name}}`, close);
          i = finish === -1 ? body.length : finish + `\\end{${name}}`.length - 1;
          continue;
        }
        envDepth += begin ? 1 : -1;
        envDepth = Math.max(0, envDepth);
        i = close === -1 ? i : close;
        continue;
      }
      i++;
      continue;
    }
    if (char === '{') braceDepth++;
    else if (char === '}') braceDepth = Math.max(0, braceDepth - 1);
    else if (char === '\n' && envDepth === 0 && braceDepth === 0) {
      const blank = /^\n[ \t]*\n/.exec(body.slice(i));
      if (blank) {
        units.push(body.slice(start, i));
        start = i + blank[0].length;
        i = start - 1;
      }
    }
  }
  units.push(body.slice(start));
  return units.map((unit) => unit.trim()).filter(Boolean);
}

type TokenKind = 'space' | 'word' | 'punct' | 'atom';

export interface LatexToken {
  kind: TokenKind;
  text: string;
  /** Comando de texto com um argumento (\emph, \section...): a parte antes do argumento. */
  head?: string;
  /** Conteúdo do argumento, comparado palavra por palavra quando só ele muda. */
  inner?: string;
}

/** Comandos cujo argumento é texto: mudou só o argumento, o diff entra nele (docs/07, passo 4). */
const RECURSABLE = new Set([
  'emph', 'textbf', 'textit', 'textsl', 'textsc', 'textsf', 'texttt', 'textrm', 'textup', 'textmd',
  'part', 'chapter', 'section', 'subsection', 'subsubsection', 'paragraph', 'subparagraph', 'caption', 'footnote',
]);

/**
 * Tokens de um bloco para o diff por palavra. Comandos com argumentos, grupos
 * entre chaves e matemática viram átomos. Nulo quando o bloco tem ambiente ou
 * algo que não se pode marcar com segurança (o bloco é tratado inteiro).
 */
export function tokenizeUnit(unit: string): LatexToken[] | null {
  const tokens: LatexToken[] = [];
  let i = 0;
  const push = (kind: TokenKind, text: string) => tokens.push({ kind, text });
  while (i < unit.length) {
    const char = unit[i]!;
    if (/\s/.test(char)) {
      let j = i;
      while (j < unit.length && /\s/.test(unit[j]!)) j++;
      push('space', unit.slice(i, j));
      i = j;
    } else if (char === '$') {
      const display = unit.startsWith('$$', i);
      const close = unit.indexOf(display ? '$$' : '$', i + (display ? 2 : 1));
      if (close === -1) return null;
      const end = close + (display ? 2 : 1);
      push('atom', unit.slice(i, end));
      i = end;
    } else if (char === '\\') {
      const next = unit[i + 1] ?? '';
      if (next === '(' || next === '[') {
        const close = unit.indexOf(next === '(' ? '\\)' : '\\]', i + 2);
        if (close === -1) return null;
        push('atom', unit.slice(i, close + 2));
        i = close + 2;
        continue;
      }
      let j = i + 1;
      let name = '';
      if (/[A-Za-z@]/.test(next)) {
        while (j < unit.length && /[A-Za-z@]/.test(unit[j]!)) j++;
        name = unit.slice(i + 1, j);
        if (name === 'begin' || name === 'end' || name === 'item' || name === 'verb') return null;
      } else j = i + 2;
      if (unit[j] === '*') j++;
      const braces: number[] = [];
      while (unit[j] === '[' || unit[j] === '{') {
        const end = groupEnd(unit, j);
        if (end === -1) return null;
        if (unit[j] === '{') braces.push(j);
        j = end;
      }
      const text = unit.slice(i, j);
      const open = braces[0];
      if (RECURSABLE.has(name) && braces.length === 1 && open !== undefined && groupEnd(unit, open) === j) {
        tokens.push({ kind: 'atom', text, head: unit.slice(i, open), inner: unit.slice(open + 1, j - 1) });
      } else push('atom', text);
      i = j;
    } else if (char === '{') {
      const end = groupEnd(unit, i);
      if (end === -1) return null;
      push('atom', unit.slice(i, end));
      i = end;
    } else if (char === '}' || char === '&' || char === '#' || char === '^' || char === '_') {
      return null;
    } else if (/[\p{L}\p{N}]/u.test(char)) {
      let j = i;
      while (j < unit.length && /[\p{L}\p{M}\p{N}]/u.test(unit[j]!)) j++;
      push('word', unit.slice(i, j));
      i = j;
    } else {
      push('punct', char);
      i++;
    }
  }
  return tokens;
}

const wordsOf = (text: string) => text.match(/[\p{L}\p{N}]+/gu) ?? [];

function jaccard(a: string, b: string): number {
  const left = new Set(wordsOf(a.toLowerCase()));
  const right = new Set(wordsOf(b.toLowerCase()));
  if (left.size === 0 && right.size === 0) return 1;
  let common = 0;
  for (const word of left) if (right.has(word)) common++;
  return common / (left.size + right.size - common);
}

/** Argumento obrigatório (o último grupo entre chaves) de um comando. */
function lastArgument(atom: string): string {
  const open = atom.lastIndexOf('{', atom.length - 1);
  for (let i = atom.indexOf('{'); i !== -1 && i <= open; i = atom.indexOf('{', i + 1)) {
    if (groupEnd(atom, i) === atom.length) return atom.slice(i + 1, -1);
  }
  return '';
}

/** Conteúdo removido não pode criar rótulo repetido, seção numerada nem figura que não existe mais. */
function neutralizeRemoved(text: string): string {
  return text
    .replace(FLOAT_ENVIRONMENTS, (float) => {
      const at = float.indexOf('\\caption');
      const open = at === -1 ? -1 : float.indexOf('{', at);
      const end = open === -1 ? -1 : groupEnd(float, open);
      return `\\DIFdelfloat{${end === -1 ? '' : float.slice(open + 1, end - 1)}}`;
    })
    .replace(/\\(label|index|glossary)\s*\{[^{}]*\}/g, '')
    .replace(/\\includegraphics\s*(\[[^\]]*\])?\s*\{[^{}]*\}/g, '[figura removida]')
    .replace(/\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\*?\s*(\[[^\]]*\])?\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g, '\\DIFdelsection{$3}');
}

function removedAtom(atom: string): string {
  if (/^\\(label|index|glossary)\b/.test(atom)) return '';
  if (SECTIONING.test(atom)) return `\\DIFdelsection{${lastArgument(atom)}}`;
  if (/^\\includegraphics\b/.test(atom)) return '\\DIFdelatom{[figura removida]}';
  return `\\DIFdelatom{${atom}}`;
}

/** Texto curto, sem comandos, para a lista de alterações. */
function previewOf(text: string): string {
  return text
    .replace(/\\[A-Za-z@]+\*?/g, ' ')
    .replace(/[{}$\\[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

export interface DiffChange {
  id: number;
  kind: 'add' | 'del' | 'mod';
  preview: string;
}

export interface AnnotatedDiff {
  source: string;
  changes: DiffChange[];
  stats: { insertedWords: number; deletedWords: number; changedBlocks: number };
}

class Emitter {
  readonly out: string[] = [];
  readonly changes: DiffChange[] = [];
  insertedWords = 0;
  deletedWords = 0;

  mark(kind: DiffChange['kind'], preview: string): string {
    const id = this.changes.length + 1;
    if (id > MAX_CHANGES) return '';
    this.changes.push({ id, kind, preview: previewOf(preview) });
    return `\\DIFmark{${id}}`;
  }

  addedBlock(unit: string) {
    this.insertedWords += wordsOf(unit).length;
    this.out.push(`\\begin{DIFaddenv}${this.mark('add', unit)}\n${unit}\n\\end{DIFaddenv}`);
  }

  removedBlock(unit: string) {
    this.deletedWords += wordsOf(unit).length;
    this.out.push(`\\begin{DIFdelenv}${this.mark('del', unit)}\n${neutralizeRemoved(unit)}\n\\end{DIFdelenv}`);
  }

  /** Bloco alterado palavra por palavra; falso quando não dá (o chamador marca o bloco inteiro). */
  modifiedBlock(before: string, after: string): boolean {
    const result = this.diffTokens(tokenizeUnit(before), tokenizeUnit(after), true);
    if (result === null) return false;
    this.out.push(result);
    return true;
  }

  /**
   * Texto anotado de dois trechos tokenizados; nulo quando não dá para marcar
   * por palavra. `withMarks` desliga o \DIFmark dentro de argumentos (títulos
   * e legendas são argumentos móveis: a posição seria gravada duas vezes).
   */
  private diffTokens(a: LatexToken[] | null, b: LatexToken[] | null, withMarks: boolean): string | null {
    if (!a || !b) return null;
    // Comando de texto alinha pela cabeça: \emph{a} e \emph{b} são "iguais" e o diff entra no argumento.
    const keyOf = (token: LatexToken) => (token.kind === 'space' ? ' ' : token.inner !== undefined ? `${token.head}{}` : token.text);
    const steps = editSteps(a.map(keyOf), b.map(keyOf));
    if (!steps) return null;
    const equal = steps.filter((step) => step === 'equal').length;
    if (equal < (1 - REWRITE_RATIO) * Math.max(a.length, b.length)) return null;

    // Segmentos por operação, absorvendo igualdades curtas entre alterações.
    type Segment = { op: 'equal' | 'insert' | 'delete'; tokens: LatexToken[]; olds: LatexToken[] };
    const segments: Segment[] = [];
    let i = 0;
    let j = 0;
    for (const step of steps) {
      // Igualdades usam o token novo (o espaço do texto atual) e guardam o antigo para o diff do argumento.
      const old = step === 'insert' ? undefined : a[i];
      const token = step === 'delete' ? a[i]! : b[j]!;
      if (step !== 'insert') i++;
      if (step !== 'delete') j++;
      const last = segments.at(-1);
      if (last && last.op === step) {
        last.tokens.push(token);
        if (old) last.olds.push(old);
      } else segments.push({ op: step, tokens: [token], olds: old ? [old] : [] });
    }
    const merged: Segment[] = [];
    segments.forEach((segment, index) => {
      const previous = segments[index - 1]?.op;
      const next = segments[index + 1]?.op;
      // Só entre uma remoção e uma inserção: em inserção pura, a palavra igual continua igual.
      const between = previous !== undefined && next !== undefined && previous !== 'equal' && next !== 'equal' && previous !== next;
      const isShort = segment.tokens.filter((token) => token.kind === 'word').length <= 2 && segment.tokens.every((token) => token.kind !== 'atom');
      if (segment.op === 'equal' && between && isShort) {
        merged.push({ op: 'delete', tokens: segment.olds, olds: [] }, { op: 'insert', tokens: segment.tokens, olds: [] });
      } else merged.push(segment);
    });

    const parts: string[] = [];
    let index = 0;
    while (index < merged.length) {
      const segment = merged[index]!;
      if (segment.op === 'equal') {
        segment.tokens.forEach((token, position) => {
          const old = segment.olds[position];
          if (!old || old.text === token.text || token.inner === undefined || old.inner === undefined) {
            parts.push(token.text);
            return;
          }
          // Mesmo comando, argumento diferente: marca dentro do argumento (sem \DIFmark lá dentro).
          const mark = withMarks ? this.mark('mod', token.inner) : '';
          const inner = this.diffTokens(tokenizeUnit(old.inner), tokenizeUnit(token.inner), false);
          parts.push(mark, inner === null ? `${removedAtom(old.text)}\\DIFaddatom{${token.text}}` : `${token.head}{${inner}}`);
        });
        index++;
        continue;
      }
      // Região alterada: remoções primeiro, depois inserções, com um marcador só.
      const deleted: LatexToken[] = [];
      const inserted: LatexToken[] = [];
      while (index < merged.length && merged[index]!.op !== 'equal') {
        (merged[index]!.op === 'delete' ? deleted : inserted).push(...merged[index]!.tokens);
        index++;
      }
      const kind = deleted.length > 0 && inserted.length > 0 ? 'mod' : deleted.length > 0 ? 'del' : 'add';
      if (withMarks) parts.push(this.mark(kind, (inserted.length > 0 ? inserted : deleted).map((token) => token.text).join('')));
      parts.push(this.emitTokens(deleted, 'delete'), this.emitTokens(inserted, 'insert'));
    }
    return parts.join('');
  }

  private emitTokens(tokens: readonly LatexToken[], op: 'insert' | 'delete'): string {
    const pieces: string[] = [];
    let text = '';
    const flushText = () => {
      const trimmed = text.trim();
      if (trimmed) {
        const words = wordsOf(trimmed).length;
        if (op === 'insert') this.insertedWords += words;
        else this.deletedWords += words;
        const lead = op === 'insert' && /^\s/.test(text) ? ' ' : '';
        const trail = /\s$/.test(text) ? ' ' : '';
        pieces.push(`${lead}${op === 'insert' ? '\\DIFadd' : '\\DIFdel'}{${trimmed.replace(/\s+/g, ' ')}}${trail}`);
      } else if (op === 'insert' && text) pieces.push(' ');
      text = '';
    };
    for (const token of tokens) {
      if (token.kind === 'atom') {
        flushText();
        pieces.push(op === 'insert' ? `\\DIFaddatom{${token.text}}` : removedAtom(token.text));
      } else text += token.text;
    }
    flushText();
    return pieces.join('');
  }
}

/** Bloco de macros injetado no fim do preâmbulo (no nível "paragraph" não usa o ulem). */
export function diffPreamble(level: DiffLevel): string {
  const strike = level === 'word';
  return [
    `% OverDocTeX diff, motor ${DIFF_ENGINE_VERSION}`,
    '\\makeatletter',
    '\\@ifpackageloaded{xcolor}{}{\\RequirePackage{xcolor}}',
    ...(strike ? ['\\@ifpackageloaded{ulem}{}{\\RequirePackage[normalem]{ulem}}'] : []),
    '\\makeatother',
    '\\colorlet{DIFaddcolor}{green!50!black}',
    '\\colorlet{DIFdelcolor}{red!75!black}',
    strike ? '\\DeclareRobustCommand{\\DIFadd}[1]{{\\color{DIFaddcolor}\\uline{#1}}}' : '\\DeclareRobustCommand{\\DIFadd}[1]{{\\color{DIFaddcolor}#1}}',
    strike ? '\\DeclareRobustCommand{\\DIFdel}[1]{{\\color{DIFdelcolor}\\sout{#1}}}' : '\\DeclareRobustCommand{\\DIFdel}[1]{{\\color{DIFdelcolor}#1}}',
    '\\DeclareRobustCommand{\\DIFaddatom}[1]{{\\color{DIFaddcolor}#1}}',
    '\\DeclareRobustCommand{\\DIFdelatom}[1]{{\\color{DIFdelcolor}#1}}',
    '\\newenvironment{DIFaddenv}{\\color{DIFaddcolor}}{}',
    '\\newenvironment{DIFdelenv}{\\color{DIFdelcolor}}{}',
    `\\DeclareRobustCommand{\\DIFdelsection}[1]{\\par\\noindent{\\color{DIFdelcolor}\\bfseries${strike ? '\\sout' : ''}{#1}}\\par}`,
    '\\DeclareRobustCommand{\\DIFdelfloat}[1]{\\par\\noindent{\\color{DIFdelcolor}[Figura ou tabela removida] #1}\\par}',
    // Destino nomeado no PDF (sem precisar do hyperref): página e altura de cada alteração.
    '\\DeclareRobustCommand{\\DIFmark}[1]{\\ifdefined\\pdfdest\\pdfdest name{DIF#1} xyz\\relax\\fi}',
    '\\ifdefined\\pdfstringdefDisableCommands',
    '  \\pdfstringdefDisableCommands{\\def\\DIFadd#1{#1}\\def\\DIFdel#1{}\\def\\DIFaddatom#1{#1}\\def\\DIFdelatom#1{}\\def\\DIFmark#1{}}%',
    '\\fi',
    '',
  ].join('\n');
}

/**
 * LaTeX anotado a partir dos dois documentos já achatados. O preâmbulo é o da
 * versão nova; mudanças de preâmbulo não são marcadas. Nulo quando algum dos
 * lados não tem \begin{document}.
 */
export function buildDiffDocument(baseSource: string, targetSource: string, level: DiffLevel): AnnotatedDiff | null {
  const base = splitDocument(stripComments(baseSource));
  const target = splitDocument(stripComments(targetSource));
  if (!base || !target) return null;
  const before = segmentUnits(base.body);
  const after = segmentUnits(target.body);
  const normalize = (unit: string) => unit.replace(/\s+/g, ' ');
  const steps = editSteps(before.map(normalize), after.map(normalize)) ?? [
    ...before.map(() => 'delete' as const),
    ...after.map(() => 'insert' as const),
  ];

  const emitter = new Emitter();
  let i = 0;
  let j = 0;
  let removed: string[] = [];
  let added: string[] = [];
  const flush = () => {
    // Pares removido e inserido parecidos viram "alterado" (diff por palavra no nível word).
    const pairs = Math.min(removed.length, added.length);
    for (let k = 0; k < Math.max(removed.length, added.length); k++) {
      const oldUnit = removed[k];
      const newUnit = added[k];
      if (k < pairs && oldUnit !== undefined && newUnit !== undefined && jaccard(oldUnit, newUnit) >= PAIR_SIMILARITY) {
        if (level === 'word' && emitter.modifiedBlock(oldUnit, newUnit)) continue;
        emitter.removedBlock(oldUnit);
        emitter.addedBlock(newUnit);
        continue;
      }
      if (oldUnit !== undefined) emitter.removedBlock(oldUnit);
      if (newUnit !== undefined) emitter.addedBlock(newUnit);
    }
    removed = [];
    added = [];
  };
  for (const step of steps) {
    if (step === 'equal') {
      flush();
      emitter.out.push(after[j]!);
      i++;
      j++;
    } else if (step === 'delete') removed.push(before[i++]!);
    else added.push(after[j++]!);
  }
  flush();

  return {
    source: `${target.preamble.trimEnd()}\n${diffPreamble(level)}\\begin{document}\n${emitter.out.join('\n\n')}\n${target.tail}`,
    changes: emitter.changes,
    stats: { insertedWords: emitter.insertedWords, deletedWords: emitter.deletedWords, changedBlocks: emitter.changes.length },
  };
}
