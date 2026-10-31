/**
 * BibTeX sem BibTeX (puro): o compilador do navegador não tem o bibtex, então
 * o app monta o `.bbl` que ele produziria a partir dos `.bib` do projeto, das
 * citações (na ordem em que aparecem, seguindo \input) e do estilo. O TeX lê
 * o `.bbl` como sempre (\bibliography procura `\jobname.bbl`).
 *
 * Estilos: plain, abbrv, alpha e unsrt (rótulos numéricos ou alfabéticos) e,
 * com natbib (ou estilos *nat), rótulos autor-ano. Outros estilos caem em
 * plain. biblatex precisa do Biber e não entra aqui.
 */
import { flattenLatex } from '@/lib/diff/latex-diff';

export interface BibEntry {
  key: string;
  type: string;
  fields: Map<string, string>;
}

/** Lê um grupo entre chaves a partir de `start` (que aponta para `{`), respeitando chaves aninhadas. */
function readBraced(text: string, start: number): { value: string; end: number } {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '\\') {
      i++;
      continue;
    }
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return { value: text.slice(start + 1, i), end: i + 1 };
  }
  return { value: text.slice(start + 1), end: text.length };
}

const MONTHS: Record<string, string> = {
  jan: 'January', feb: 'February', mar: 'March', apr: 'April', may: 'May', jun: 'June',
  jul: 'July', aug: 'August', sep: 'September', oct: 'October', nov: 'November', dec: 'December',
};

/** Entradas de um .bib, com @string e concatenação (#) resolvidos. */
export function parseBibFile(content: string, strings = new Map<string, string>()): BibEntry[] {
  const entries: BibEntry[] = [];
  const entryRe = /@([a-zA-Z]+)\s*[{(]/g;
  let match: RegExpExecArray | null;
  while ((match = entryRe.exec(content)) !== null) {
    const type = match[1]!.toLowerCase();
    const open = entryRe.lastIndex - 1;
    const { value: body, end } = content[open] === '(' ? { value: content.slice(open + 1, content.indexOf(')', open)), end: content.indexOf(')', open) + 1 } : readBraced(content, open);
    entryRe.lastIndex = end;
    if (type === 'comment' || type === 'preamble') continue;
    const comma = body.indexOf(',');
    const key = type === 'string' ? '' : body.slice(0, comma).trim();
    const fields = parseFields(type === 'string' ? body : body.slice(comma + 1), strings);
    if (type === 'string') {
      for (const [name, value] of fields) strings.set(name, value);
      continue;
    }
    if (key) entries.push({ key, type, fields });
  }
  return entries;
}

function parseFields(body: string, strings: ReadonlyMap<string, string>): Map<string, string> {
  const fields = new Map<string, string>();
  let i = 0;
  while (i < body.length) {
    const nameMatch = /^[\s,]*([A-Za-z][\w-]*)\s*=\s*/.exec(body.slice(i));
    if (!nameMatch) break;
    const name = nameMatch[1]!.toLowerCase();
    i += nameMatch[0].length;
    const parts: string[] = [];
    // valor: partes entre chaves, aspas, números ou macros, unidas por #
    for (;;) {
      while (/\s/.test(body[i] ?? '')) i++;
      const char = body[i];
      if (char === '{') {
        const read = readBraced(body, i);
        parts.push(read.value);
        i = read.end;
      } else if (char === '"') {
        let j = i + 1;
        let depth = 0;
        while (j < body.length && !(body[j] === '"' && depth === 0)) {
          if (body[j] === '{') depth++;
          else if (body[j] === '}') depth--;
          j++;
        }
        parts.push(body.slice(i + 1, j));
        i = j + 1;
      } else {
        const word = /^[^\s,#}]+/.exec(body.slice(i))?.[0] ?? '';
        const lower = word.toLowerCase();
        parts.push(strings.get(lower) ?? (/^\d+$/.test(word) ? word : (MONTHS[lower] ?? word)));
        i += word.length;
      }
      while (/\s/.test(body[i] ?? '')) i++;
      if (body[i] === '#') {
        i++;
        continue;
      }
      break;
    }
    fields.set(name, parts.join('').replace(/\s+/g, ' ').trim());
  }
  return fields;
}

export interface CitationInfo {
  /** Chaves na ordem da primeira citação; '*' quando há \nocite{*}. */
  keys: string[];
  databases: string[];
  style: string | null;
  usesNatbib: boolean;
}

const CITE = /\\(no)?cite[a-zA-Z]*\*?\s*(?:\[[^\]]*\]\s*){0,2}\{([^}]*)\}/g;

/** Citações, bancos (\bibliography) e estilo do documento já achatado. */
export function scanCitations(source: string): CitationInfo {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const match of source.matchAll(CITE)) {
    for (const raw of match[2]!.split(',')) {
      const key = raw.trim();
      if (key && !seen.has(key)) {
        seen.add(key);
        keys.push(key);
      }
    }
  }
  const databases = [...source.matchAll(/\\bibliography\s*\{([^}]*)\}/g)].flatMap((match) =>
    match[1]!.split(',').map((name) => name.trim()).filter(Boolean),
  );
  const style = /\\bibliographystyle\s*\{([^}]*)\}/.exec(source)?.[1]?.trim() ?? null;
  const usesNatbib = /\\usepackage\s*(\[[^\]]*\])?\s*\{[^}]*\bnatbib\b[^}]*\}/.test(source) || Boolean(style && /nat$/.test(style));
  return { keys, databases, style, usesNatbib };
}

interface Person {
  first: string;
  von: string;
  last: string;
  jr: string;
}

/** "Sobrenome, Nome" ou "Nome Sobrenome" (chaves protegem nomes compostos). */
function parsePerson(raw: string): Person {
  const name = raw.trim();
  const parts = splitTopLevel(name, ',');
  if (parts.length >= 2) {
    const lastWords = parts[0]!.trim().split(/\s+/);
    const vonIndex = lastWords.findIndex((word) => /^[a-z]/.test(word));
    return {
      von: vonIndex >= 0 && vonIndex < lastWords.length - 1 ? lastWords.slice(vonIndex, -1).join(' ') : '',
      last: vonIndex >= 0 && vonIndex < lastWords.length - 1 ? lastWords.at(-1)! : lastWords.join(' '),
      jr: parts.length === 3 ? parts[1]!.trim() : '',
      first: (parts.length === 3 ? parts[2]! : parts[1]!).trim(),
    };
  }
  const words = splitTopLevel(name, ' ').filter(Boolean);
  if (words.length <= 1) return { first: '', von: '', last: name, jr: '' };
  const vonStart = words.findIndex((word, index) => index > 0 && index < words.length - 1 && /^[a-z]/.test(word));
  const lastStart = vonStart >= 0 ? vonStart : words.length - 1;
  const von = vonStart >= 0 ? words.slice(vonStart, words.length - 1).join(' ') : '';
  return { first: words.slice(0, lastStart).join(' '), von, last: words.at(-1)!, jr: '' };
}

function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of text) {
    if (char === '{') depth++;
    if (char === '}') depth--;
    if (char === separator && depth === 0) {
      parts.push(current);
      current = '';
    } else current += char;
  }
  parts.push(current);
  return parts;
}

function people(field: string | undefined): Person[] {
  if (!field) return [];
  return field
    .split(/\s+and\s+/)
    .map((name) => name.trim())
    .filter(Boolean)
    .map(parsePerson);
}

const initials = (first: string) =>
  first
    .split(/[\s~]+/)
    .filter(Boolean)
    .map((word) => (word.startsWith('{') ? word : `${word.replace(/^[^\p{L}]*/u, '').charAt(0)}.`))
    .join('~');

function fullName(person: Person, abbreviate: boolean): string {
  const first = abbreviate ? initials(person.first) : person.first;
  // abbrv amarra a inicial ao sobrenome ("A.~Silva"), como o bibtex.
  return [first, person.von, person.last].filter(Boolean).join(abbreviate ? '~' : ' ') + (person.jr ? `, ${person.jr}` : '');
}

/** "A", "A and B", "A, B, and C" como o plain. */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names.at(-1)}`;
}

const lastNameOf = (person: Person) => [person.von, person.last].filter(Boolean).join(' ').replace(/[{}]/g, '');

function sortKey(entry: BibEntry): string {
  const authors = people(entry.fields.get('author') ?? entry.fields.get('editor'));
  const names = authors.map((person) => `${lastNameOf(person)} ${person.first}`).join(' ');
  return `${names} ${entry.fields.get('year') ?? ''} ${entry.fields.get('title') ?? ''}`.toLowerCase().replace(/[{}\\]/g, '');
}

/** Rótulo do alpha: iniciais dos sobrenomes e ano com dois dígitos (Sil20, SS20, ABC+20). */
function alphaLabel(entry: BibEntry): string {
  const authors = people(entry.fields.get('author') ?? entry.fields.get('editor'));
  const year = (entry.fields.get('year') ?? '').slice(-2);
  if (authors.length === 0) return `${entry.key.slice(0, 3)}${year}`;
  if (authors.length === 1) return `${lastNameOf(authors[0]!).slice(0, 3)}${year}`;
  const letters = authors.slice(0, 3).map((person) => lastNameOf(person).charAt(0)).join('');
  return `${letters}${authors.length > 3 ? '{\\etalchar{+}}' : ''}${year}`;
}

/** Rótulo autor-ano do natbib: "Silva(2020)", "Silva and Souza(2020)", "Silva et~al.(2020)". */
function natbibLabel(entry: BibEntry): string {
  const authors = people(entry.fields.get('author') ?? entry.fields.get('editor')).map(lastNameOf);
  const year = entry.fields.get('year') ?? '';
  const short = authors.length === 0 ? entry.key : authors.length === 1 ? authors[0] : authors.length === 2 ? `${authors[0]} and ${authors[1]}` : `${authors[0]} et~al.`;
  return `${short}(${year})${joinNames(authors)}`;
}

function sentence(text: string | undefined): string {
  if (!text) return '';
  return /[.?!]\}*$/.test(text) ? text : `${text}.`;
}

/** Corpo de uma entrada no formato do plain (\newblock separa as partes). */
function formatEntry(entry: BibEntry, abbreviate: boolean): string {
  const field = (name: string) => entry.fields.get(name);
  const authors = joinNames(people(field('author')).map((person) => fullName(person, abbreviate)));
  const editors = joinNames(people(field('editor')).map((person) => fullName(person, abbreviate)));
  const pages = field('pages')?.replace(/\s*-+\s*/g, '--');
  const date = [field('month'), field('year')].filter(Boolean).join(' ');
  const blocks: string[] = [];
  blocks.push(sentence(authors || (editors ? `${editors}, editors` : '')));
  const title = field('title');
  const isBook = ['book', 'phdthesis', 'mastersthesis', 'manual', 'proceedings'].includes(entry.type);
  if (title) blocks.push(sentence(isBook ? `\\emph{${title}}` : title));
  const tail: string[] = [];
  switch (entry.type) {
    case 'article': {
      const volume = [field('volume'), field('number') ? `(${field('number')})` : ''].join('');
      tail.push(`\\emph{${field('journal') ?? ''}}${volume ? `, ${volume}` : ''}${pages ? `:${pages}` : ''}`);
      break;
    }
    case 'inproceedings':
    case 'incollection':
    case 'conference': {
      const where = field('booktitle') ? `In ${editors ? `${editors}, editors, ` : ''}\\emph{${field('booktitle')}}` : '';
      tail.push([where, pages ? `pages ${pages}` : '', field('organization'), field('publisher'), field('address')].filter(Boolean).join(', '));
      break;
    }
    case 'phdthesis':
    case 'mastersthesis':
      tail.push([entry.type === 'phdthesis' ? 'PhD thesis' : "Master's thesis", field('school'), field('address')].filter(Boolean).join(', '));
      break;
    case 'techreport':
      tail.push([`${field('type') ?? 'Technical Report'}${field('number') ? ` ${field('number')}` : ''}`, field('institution'), field('address')].filter(Boolean).join(', '));
      break;
    case 'book':
    case 'manual':
    case 'proceedings':
      tail.push([field('edition') ? `${field('edition')} edition` : '', field('publisher') ?? field('organization'), field('address')].filter(Boolean).join(', '));
      break;
    default:
      tail.push(field('howpublished') ?? field('publisher') ?? field('institution') ?? '');
  }
  const last = [tail.join(', '), date].filter(Boolean).join(', ');
  if (last) blocks.push(sentence(last));
  const url = field('url') ?? (field('doi') ? `https://doi.org/${field('doi')!.replace(/^https?:\/\/doi\.org\//, '')}` : undefined);
  if (url) blocks.push(`\\url{${url}}`);
  if (field('note')) blocks.push(sentence(field('note')));
  return blocks.filter(Boolean).join('\n\\newblock ');
}

export interface BblResult {
  bbl: string;
  /** Citações sem entrada nos .bib (o TeX mostra [?]). */
  missing: string[];
}

/**
 * Monta o .bbl do documento. Nulo quando ele não usa \bibliography (sem
 * bibliografia, ou com biblatex, que precisaria do Biber).
 */
export function buildBbl(texts: ReadonlyMap<string, string>, mainPath: string): BblResult | null {
  const source = flattenLatex(texts, mainPath);
  const info = scanCitations(source);
  if (info.databases.length === 0) return null;
  const folder = mainPath.includes('/') ? mainPath.slice(0, mainPath.lastIndexOf('/') + 1) : '';
  const strings = new Map<string, string>();
  const byKey = new Map<string, BibEntry>();
  for (const name of info.databases) {
    const path = `${folder}${name.endsWith('.bib') ? name : `${name}.bib`}`.replace(/^\.\//, '');
    const content = texts.get(path);
    if (content === undefined) continue;
    for (const entry of parseBibFile(content, strings)) if (!byKey.has(entry.key)) byKey.set(entry.key, entry);
  }

  const wantsAll = info.keys.includes('*');
  const cited = info.keys.filter((key) => key !== '*');
  const chosen = [...cited.flatMap((key) => (byKey.has(key) ? [byKey.get(key)!] : [])), ...(wantsAll ? [...byKey.values()].filter((entry) => !cited.includes(entry.key)) : [])];
  const style = (info.style ?? 'plain').toLowerCase();
  const isUnsorted = style.startsWith('unsrt');
  const entries = isUnsorted ? chosen : [...chosen].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  const abbreviate = style.startsWith('abbrv');
  const labels = entries.map((entry) => (info.usesNatbib ? natbibLabel(entry) : style === 'alpha' ? alphaLabel(entry) : null));
  const widest = labels.some(Boolean) ? labels.reduce<string>((widestLabel, label) => (label && label.length > widestLabel.length ? label : widestLabel), '') : String(entries.length || 1);

  const lines = [
    '% Gerado pelo OverDocTeX (BibTeX no navegador)',
    '\\providecommand{\\url}[1]{\\texttt{#1}}',
    '\\providecommand{\\etalchar}[1]{$^{#1}$}',
    `\\begin{thebibliography}{${widest}}`,
    '',
    ...entries.flatMap((entry, index) => [`\\bibitem${labels[index] ? `[${labels[index]}]` : ''}{${entry.key}}`, formatEntry(entry, abbreviate), '']),
    '\\end{thebibliography}',
    '',
  ];
  return { bbl: lines.join('\n'), missing: cited.filter((key) => !byKey.has(key)) };
}
