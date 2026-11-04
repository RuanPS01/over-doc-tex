/**
 * biblatex sem Biber: o compilador do navegador não tem o Biber, então o app
 * monta o .bbl que ele produziria (formato 3.3, o do biblatex 3.21 do TeX
 * Live 2025) a partir dos .bib do projeto, das citações e da configuração
 * do biblatex (biblatex-config.ts: opções, estilo, modelos de ordenação).
 *
 * O que o Biber faz e entra aqui: mapas de campos (journal vira
 * journaltitle, @phdthesis vira @thesis...), herança de crossref e xdata,
 * nomes (partes, iniciais, hashes), listas, datas, intervalos de páginas,
 * URL, ordenação pelos modelos (none, nty, nyt, ynt, anyt... e os do
 * estilo), labelname, labeltitle, labeldate, labelalpha, extraname,
 * extradate, extraalpha, uniquename, uniquelist e singletitle. Ficam de
 * fora conjuntos (@set), campos related, transliteração e mapas com
 * expressões que o JavaScript não lê.
 *
 * O texto dos campos vai como está no .bib (o TeX lê os acentos em LaTeX);
 * acentos decodificados servem para ordenar, para os rótulos e para os
 * hashes, que saem iguais aos do Biber.
 */
import { flattenLatex, splitDocument, stripComments } from '@/lib/diff/latex-diff';
import { splitTopLevel } from './bib-names';
import {
  applyOption,
  keyValues,
  readBiblatexConfig,
  refcontextsIn,
  type BiblatexConfig,
  type BiblatexOptions,
  type RefcontextSpec,
  type SortingNamekeyTemplate,
  type SortSpec,
  type SourcemapRule,
} from './biblatex-config';
import { parseBibFile, type BibEntry } from './bibliography';
import { decodeLatex, plainText } from './latex-text';
import { md5Hex } from './md5';

// ---------- Modelo de dados (blx-dm.def) ----------

const NAME_FIELDS = new Set([
  'afterword', 'annotator', 'author', 'bookauthor', 'commentator', 'editor', 'editora', 'editorb', 'editorc', 'foreword', 'holder',
  'introduction', 'namea', 'nameb', 'namec', 'translator', 'shortauthor', 'shorteditor', 'sortname',
]);
const LIST_FIELDS = new Set([
  'institution', 'lista', 'listb', 'listc', 'listd', 'liste', 'listf', 'location', 'organization', 'origlocation', 'origpublisher',
  'publisher', 'language', 'origlanguage',
]);
const LITERAL_FIELDS = new Set([
  'abstract', 'addendum', 'annotation', 'booksubtitle', 'booktitle', 'booktitleaddon', 'chapter', 'edition', 'eid', 'entrysubtype',
  'eprintclass', 'eprinttype', 'eventtitle', 'eventtitleaddon', 'gender', 'howpublished', 'indexsorttitle', 'indextitle', 'isan', 'isbn',
  'ismn', 'isrn', 'issn', 'issue', 'issuesubtitle', 'issuetitle', 'issuetitleaddon', 'iswc', 'journalsubtitle', 'journaltitle',
  'journaltitleaddon', 'label', 'langid', 'langidopts', 'library', 'mainsubtitle', 'maintitle', 'maintitleaddon', 'nameaddon', 'note',
  'number', 'origtitle', 'pagetotal', 'part', 'relatedstring', 'relatedtype', 'reprinttitle', 'series', 'shorthandintro', 'subtitle',
  'title', 'titleaddon', 'usera', 'userb', 'userc', 'userd', 'usere', 'userf', 'venue', 'version', 'shorthand', 'shortjournal',
  'shortseries', 'shorttitle', 'volume', 'volumes', 'authortype', 'editoratype', 'editorbtype', 'editorctype', 'editortype',
  'bookpagination', 'nameatype', 'namebtype', 'namectype', 'pagination', 'pubstate', 'type', 'execute', 'month', 'year',
]);
/** Campos que só servem à ordenação: não saem no .bbl. */
const SORT_ONLY_FIELDS = new Set(['sorttitle', 'sortshorthand', 'sortkey', 'presort', 'sortyear', 'sortname']);
const VERBATIM_FIELDS = ['doi', 'eprint', 'file', 'verba', 'verbb', 'verbc'];
const DATE_FIELDS: Record<string, string> = { date: '', eventdate: 'event', origdate: 'orig', urldate: 'url' };

/** Herança de crossref (biblatex.def): campo do pai que vira outro no filho, por par de tipos. */
const INHERITANCE: { parents: string[]; children: string[]; rename: [string, string][]; skip: string[] }[] = [
  { parents: ['mvbook', 'book'], children: ['inbook', 'bookinbook', 'suppbook'], rename: [['author', 'author'], ['author', 'bookauthor']], skip: [] },
  ...(
    [
      [['mvbook'], ['book', 'inbook', 'bookinbook', 'suppbook'], 'main'],
      [['mvcollection', 'mvreference'], ['collection', 'reference', 'incollection', 'inreference', 'suppcollection'], 'main'],
      [['mvproceedings'], ['proceedings', 'inproceedings'], 'main'],
      [['book'], ['inbook', 'bookinbook', 'suppbook'], 'book'],
      [['collection', 'reference'], ['incollection', 'inreference', 'suppcollection'], 'book'],
      [['proceedings'], ['inproceedings'], 'book'],
      [['periodical'], ['article', 'suppperiodical'], 'journal'],
    ] as const
  ).map(([parents, children, prefix]) => ({
    parents: [...parents],
    children: [...children],
    rename: [['title', `${prefix}title`], ['subtitle', `${prefix}subtitle`], ['titleaddon', `${prefix}titleaddon`]] as [string, string][],
    skip: ['shorttitle', 'sorttitle', 'indextitle', 'indexsorttitle'],
  })),
];
const NEVER_INHERITED = new Set([
  'ids', 'crossref', 'xref', 'entryset', 'entrysubtype', 'execute', 'label', 'options', 'presort', 'related', 'relatedoptions',
  'relatedstring', 'relatedtype', 'shorthand', 'shorthandintro', 'sortkey', 'xdata',
]);

const MONTH_NUMBERS: Record<string, string> = {
  jan: '1', feb: '2', mar: '3', apr: '4', may: '5', jun: '6', jul: '7', aug: '8', sep: '9', oct: '10', nov: '11', dec: '12',
};
const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

// ---------- Nomes ----------

interface Name {
  family: string[];
  given: string[];
  prefix: string[];
  suffix: string[];
}

interface NameList {
  names: Name[];
  /** "and others" no fim. */
  more: boolean;
}

/** Caixa da primeira letra de uma palavra no nível de fora das chaves ({\'e} conta pela letra). */
function wordCase(word: string): 'upper' | 'lower' | 'none' {
  let depth = 0;
  for (let i = 0; i < word.length; i++) {
    const char = word[i]!;
    if (char === '{') {
      if (depth === 0 && word[i + 1] === '\\') {
        const special = /^\{\\(?:[a-zA-Z]+|[^a-zA-Z])\s*\{?\s*(\p{L})/u.exec(word.slice(i));
        if (special) return special[1] === special[1]!.toLowerCase() && special[1] !== special[1]!.toUpperCase() ? 'lower' : 'upper';
      }
      depth++;
      continue;
    }
    if (char === '}') {
      depth--;
      continue;
    }
    if (depth > 0) continue;
    if (char === '\\') {
      const accent = /^\\[^a-zA-Z]\s*\{?(\p{L})/u.exec(word.slice(i));
      if (accent) return accent[1] === accent[1]!.toLowerCase() ? 'lower' : 'upper';
      continue;
    }
    if (/\p{L}/u.test(char)) return char === char.toLowerCase() && char !== char.toUpperCase() ? 'lower' : 'upper';
  }
  return 'none';
}

/** Palavras de uma parte do nome (espaço e til separam; dentro de chaves não). */
const words = (text: string) => splitTopLevel(text.trim().replace(/(?<!\\)~/g, ' '), ' ').map((word) => word.trim()).filter(Boolean);

/** "von Last" em von e Last: von vai até a última palavra em minúscula antes da última. */
function splitVonLast(parts: string[]): { prefix: string[]; family: string[] } {
  let lastVon = -1;
  for (let i = 0; i < parts.length - 1; i++) if (wordCase(parts[i]!) === 'lower') lastVon = i;
  if (lastVon < 0 || wordCase(parts[0]!) !== 'lower') return { prefix: [], family: parts };
  return { prefix: parts.slice(0, lastVon + 1), family: parts.slice(lastVon + 1) };
}

/** Nome do BibTeX nas partes do Biber: "First von Last", "von Last, First" e "von Last, Jr, First". */
export function parseName(raw: string): Name {
  const pieces = splitTopLevel(raw.trim(), ',').map((piece) => piece.trim());
  if (pieces.length >= 2) {
    const { prefix, family } = splitVonLast(words(pieces[0]!));
    return {
      prefix,
      family,
      suffix: pieces.length >= 3 ? words(pieces[1]!) : [],
      given: words(pieces.length >= 3 ? pieces.slice(2).join(', ') : pieces[1]!),
    };
  }
  const all = words(pieces[0] ?? '');
  if (all.length <= 1) return { family: all, given: [], prefix: [], suffix: [] };
  // First von Last: o von começa na primeira palavra em minúscula (que não seja a última).
  const vonStart = all.findIndex((word, index) => index < all.length - 1 && wordCase(word) === 'lower');
  if (vonStart < 0) return { given: all.slice(0, -1), family: all.slice(-1), prefix: [], suffix: [] };
  const rest = splitVonLast(all.slice(vonStart));
  return { given: all.slice(0, vonStart), prefix: rest.prefix, family: rest.family, suffix: [] };
}

/** Pessoas de um campo de nomes; "and others" no fim vira `more`. */
export function parseNameList(field: string): NameList {
  const raw = splitAnd(field);
  const more = raw.length > 0 && raw.at(-1)!.trim().toLowerCase() === 'others';
  const names = (more ? raw.slice(0, -1) : raw).map(parseName).filter((name) => name.family.length > 0 || name.given.length > 0);
  return { names, more };
}

/** Divide no " and " de fora das chaves. */
function splitAnd(field: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < field.length; i++) {
    const char = field[i]!;
    if (char === '{') depth++;
    else if (char === '}') depth--;
    else if (depth === 0 && /\s/.test(char)) {
      const and = /^\s+and\s+/i.exec(field.slice(i));
      if (and) {
        parts.push(field.slice(start, i));
        start = i + and[0].length;
        i = start - 1;
      }
    }
  }
  parts.push(field.slice(start));
  return parts.map((part) => part.trim()).filter(Boolean);
}

const graphemes = (text: string) => [...plainText(text)].length;

/** Junta as palavras de uma parte com os separadores do Biber (\bibnamedelima, b, i). */
function joinNamePart(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  const after = (word: string, fallback: string) => (/\.\}*$/.test(word) ? '\\bibnamedelimi ' : fallback);
  if (parts.length === 2) return `${parts[0]}${after(parts[0]!, '\\bibnamedelima ')}${parts[1]}`;
  let out = `${parts[0]}${after(parts[0]!, graphemes(parts[0]!) < 3 ? '\\bibnamedelima ' : '\\bibnamedelimb ')}`;
  for (let i = 1; i < parts.length - 1; i++) out += `${parts[i]}${after(parts[i]!, i === parts.length - 2 ? '\\bibnamedelima ' : '\\bibnamedelimb ')}`;
  return out + parts.at(-1)!;
}

/** Inicial de uma palavra (decodificada): "Hans-Jörg" dá "H\bibinithyphendelim J". */
function initialOf(word: string): string {
  const pieces = plainText(word).split('-').filter(Boolean);
  const first = (piece: string) => [...piece.replace(/^[^\p{L}\p{N}]+/u, '')][0] ?? '';
  return pieces.map(first).filter(Boolean).join('\\bibinithyphendelim ');
}

function initials(parts: string[]): string {
  return parts
    .map(initialOf)
    .filter(Boolean)
    .map((initial) => `${initial}\\bibinitperiod`)
    .join('\\bibinitdelim ');
}

/** Texto para hash: partes decodificadas, sem chaves, tis, pontos e espaços (normalise_string_hash do Biber). */
const hashText = (text: string) => decodeLatex(text).replace(/[{}~.\s]+/g, '');
const partText = (parts: string[]) => parts.join(' ');

function nameHashString(name: Name): string {
  return [name.family, name.given, name.prefix, name.suffix].map((part) => hashText(partText(part))).join('');
}

/** Base do nome para uniquename (prefixo só com useprefix) e a versão com iniciais ou nome completo. */
function nameBase(name: Name, useprefix: boolean): string {
  return plainText(partText(useprefix ? [...name.prefix, ...name.family] : name.family));
}
const givenInitials = (name: Name) => name.given.map((word) => initialOf(word)).join(' ');
const givenFull = (name: Name) => plainText(partText(name.given));

// ---------- Entradas ----------

interface Entry {
  key: string;
  type: string;
  /** Campos de texto (já mapeados), crus como no .bib. */
  fields: Map<string, string>;
  names: Map<string, NameList>;
  lists: Map<string, { items: string[]; more: boolean }>;
  options: string[];
  optionValues: BiblatexOptions;
  dates: Map<string, string>;
  /** Ordem da primeira citação (crossref e \nocite{*} vêm depois). */
  citeorder: number;
  intciteorder: number;
}

/** Aplica os mapas de campos do Biber a uma entrada crua do .bib. */
export function applySourcemaps(entry: BibEntry, rules: readonly SourcemapRule[]): BibEntry {
  let type = entry.type;
  const fields = new Map(entry.fields);
  for (const rule of rules) {
    if (rule.pertype.length > 0 && !rule.pertype.includes(type)) continue;
    if (rule.pernottype.includes(type)) continue;
    let lastValue: string | null = null;
    for (const step of rule.steps) {
      const overwrite = step.overwrite ?? rule.overwrite;
      if (step.typesource) {
        if (type !== step.typesource) {
          if (step.final) break;
          continue;
        }
        if (step.typetarget) type = step.typetarget;
        continue;
      }
      if (step.fieldsource) {
        const value = fields.get(step.fieldsource);
        if (value === undefined) {
          if (step.final) break;
          continue;
        }
        let matched = true;
        let newValue = value;
        if (step.match !== undefined || step.notmatch !== undefined) {
          const pattern = safeRegex(step.match ?? step.notmatch!);
          if (!pattern) {
            if (step.final) break;
            continue;
          }
          matched = pattern.test(value) === (step.match !== undefined);
          // Substituição no estilo do Perl: \\ e \{ viram \ e {; $1 continua sendo o grupo.
          if (matched && step.replace !== undefined && step.match !== undefined) newValue = value.replace(new RegExp(pattern.source, 'g'), step.replace.replace(/\$(?!\d)/g, '$$$$').replace(/\\(.)/g, '$1'));
        }
        if (!matched) {
          if (step.final) break;
          continue;
        }
        lastValue = newValue;
        if (step.fieldtarget) {
          if (!overwrite && fields.has(step.fieldtarget)) continue;
          fields.delete(step.fieldsource);
          fields.set(step.fieldtarget, newValue);
        } else if (newValue !== value) fields.set(step.fieldsource, newValue);
        continue;
      }
      if (step.fieldset) {
        if (step.null) {
          fields.delete(step.fieldset);
          continue;
        }
        const value = step.origfieldval ? lastValue : (step.fieldvalue ?? null);
        if (value === null) continue;
        if (fields.has(step.fieldset) && !overwrite && !step.append) continue;
        fields.set(step.fieldset, step.append && fields.has(step.fieldset) ? `${fields.get(step.fieldset)}${value}` : value);
      }
    }
  }
  return { key: entry.key, type, fields };
}

/** Expressão do Perl que o JavaScript entende do mesmo jeito; nula quando não dá para confiar. */
function safeRegex(source: string): RegExp | null {
  if (/\(\?[<!=]?[a-zA-Z]|\\[pPQEGAZz]|\(\?\^/.test(source)) return null;
  try {
    return new RegExp(source.replace(/\\\\/g, '\\'));
  } catch {
    return null;
  }
}

/** Datas no formato do biblatex (ISO 8601 e intervalos): ano, mês, dia e fim do intervalo. */
function parseDate(value: string): { start: [string, string, string]; end: [string, string, string] | null; open: boolean } | null {
  const clean = value.trim();
  const part = (text: string): [string, string, string] | null => {
    const match = /^(-?\d{1,4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?(?:T[\d:.]+(?:Z|[+-][\d:]+)?)?[?~%]?$/.exec(text.trim());
    if (!match) return null;
    const strip = (number: string | undefined) => (number ? String(Number(number)) : '');
    return [match[1]!, strip(match[2]), strip(match[3])];
  };
  const [startText, endText] = clean.includes('/') ? clean.split('/', 2) : [clean, undefined];
  const start = part(startText!);
  if (!start) return null;
  if (endText === undefined) return { start, end: null, open: false };
  if (endText === '' || endText === '..') return { start, end: null, open: true };
  const end = part(endText);
  return end ? { start, end, open: false } : null;
}

/** Mês em número, como o Biber: "9", "sep", "Sept." e "September" dão 9; outro texto fica como está. */
function monthNumber(value: string): string {
  const lower = plainText(value).toLowerCase().replace(/\.$/, '');
  if (/^\d{1,2}$/.test(lower)) return String(Number(lower));
  const byName = lower.length >= 3 ? MONTH_NAMES.findIndex((name) => name.startsWith(lower)) : -1;
  return byName >= 0 ? String(byName + 1) : value;
}

/** Algarismo romano ou arábico em número; nulo se não for número. */
function pageNumber(text: string): number | null {
  if (/^\d+$/.test(text)) return Number(text);
  if (!/^[ivxlcdm]+$/i.test(text)) return null;
  const values: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
  let total = 0;
  const lower = text.toLowerCase();
  for (let i = 0; i < lower.length; i++) {
    const current = values[lower[i]!]!;
    const next = values[lower[i + 1] ?? ''] ?? 0;
    total += current < next ? -current : current;
  }
  return total;
}

/** "479--486, 490" em \bibrangedash e \bibrangessep, e quantas páginas são (-1 se não der para contar). */
function formatRange(value: string): { text: string; count: number } {
  let count = 0;
  const items = value.split(/\s*,\s*/).filter(Boolean);
  const text = items
    .map((item) => {
      const match = /^(.*?)\s*(?:-+|\u2013|\u2014|\\textendash\s*)\s*(.*)$/.exec(item);
      if (!match) {
        if (count >= 0) count += pageNumber(item) !== null ? 1 : Number.NaN;
        return item;
      }
      const [, start, end] = match;
      const from = pageNumber(start!);
      const to = end ? pageNumber(end) : null;
      if (from === null || (end && to === null)) count = Number.NaN;
      else if (to !== null) count += Math.abs(to - from) + 1;
      return end ? `${start}\\bibrangedash ${end}` : `${start}\\bibrangedash`;
    })
    .join('\\bibrangessep ');
  return { text, count: Number.isNaN(count) ? -1 : count };
}

/** URL como o Biber escreve (espaços e caracteres fora do ASCII em %XX). */
function escapeUrl(url: string): string {
  return [...url]
    .map((char) => (/[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]/.test(char) ? char : [...new TextEncoder().encode(char)].map((byte) => `%${byte.toString(16).toUpperCase().padStart(2, '0')}`).join('')))
    .join('');
}

function entryOptions(raw: string | undefined): string[] {
  if (!raw) return [];
  return keyValues(raw).map(([key, value]) => `${key}=${value}`);
}

/** Herda do pai os campos que faltam no filho (crossref), com as regras do biblatex. */
function inherit(child: BibEntry, parent: BibEntry): Set<string> {
  const added = new Set<string>();
  const rule = INHERITANCE.filter((candidate) => candidate.parents.includes(parent.type) && candidate.children.includes(child.type));
  const renamed = new Map<string, string[]>();
  const skipped = new Set<string>();
  for (const { rename, skip } of rule) {
    for (const [from, to] of rename) renamed.set(from, [...(renamed.get(from) ?? []), to]);
    skip.forEach((field) => skipped.add(field));
  }
  for (const [field, value] of parent.fields) {
    if (NEVER_INHERITED.has(field) || skipped.has(field)) continue;
    for (const target of renamed.get(field) ?? [field]) {
      if (child.fields.has(target)) continue;
      child.fields.set(target, value);
      added.add(target);
    }
  }
  return added;
}

function buildEntry(raw: BibEntry, config: BiblatexConfig, datamodel: Datamodel): Entry {
  const optionValues: BiblatexOptions = { ...config.options, use: { ...config.options.use } };
  const options = entryOptions(raw.fields.get('options'));
  for (const option of options) {
    const [key, value] = option.split('=') as [string, string];
    applyOption(optionValues, key, value);
  }
  const fields = new Map<string, string>();
  const names = new Map<string, NameList>();
  const lists = new Map<string, { items: string[]; more: boolean }>();
  const dates = new Map<string, string>();
  for (const [field, value] of raw.fields) {
    if (datamodel.names.has(field)) {
      const list = parseNameList(value);
      if (list.names.length > 0 || list.more) names.set(field, list);
    } else if (datamodel.lists.has(field)) {
      const items = splitAnd(value);
      const more = items.length > 0 && items.at(-1)!.toLowerCase() === 'others';
      lists.set(field, { items: more ? items.slice(0, -1) : items, more });
    } else if (datamodel.dates.has(field)) {
      dates.set(field, value);
    } else fields.set(field, value);
  }
  return { key: raw.key, type: raw.type, fields, names, lists, options, optionValues, dates, citeorder: 0, intciteorder: 0 };
}

interface Datamodel {
  names: Set<string>;
  lists: Set<string>;
  literals: Set<string>;
  verbatim: Set<string>;
  dates: Set<string>;
  ranges: Set<string>;
}

function datamodelOf(config: BiblatexConfig): Datamodel {
  const extra = config.datamodel;
  return {
    names: new Set([...NAME_FIELDS, ...extra.names]),
    lists: new Set([...LIST_FIELDS, ...extra.lists]),
    literals: new Set([...LITERAL_FIELDS, ...extra.fields]),
    verbatim: new Set([...VERBATIM_FIELDS, 'url', ...extra.verbatim]),
    dates: new Set([...Object.keys(DATE_FIELDS), ...extra.dates]),
    ranges: new Set(['pages', ...extra.ranges]),
  };
}

// ---------- Rótulos e unicidade ----------

interface Labels {
  labelname: string | null;
  /** Lista do fullhash: a do labelname, sem shortauthor e shorteditor. */
  fullname: string | null;
  labeltitle: string | null;
  labeldatesource: string | null;
  labelyear: string;
  /** Nomes visíveis na citação (com uniquelist) e se a lista foi cortada. */
  visible: number;
  ul: number | null;
  un: Map<Name, number>;
}

function visibleCount(list: NameList, max: number, min: number, ul: number | null): number {
  const total = list.names.length;
  if (total <= max && !(list.more && total > max)) return total;
  return Math.min(total, Math.max(min, ul ?? 0));
}

function listHash(list: NameList, count: number, nohashothers: boolean): string {
  const text = list.names.slice(0, count).map(nameHashString).join('');
  const truncated = count < list.names.length || list.more;
  return md5Hex(text + (truncated && !nohashothers ? '+' : ''));
}

function firstDefined(entry: Entry, fields: readonly string[]): string | null {
  for (const field of fields) {
    if (field.startsWith('literal:')) return field;
    if (entry.names.has(field) && entry.optionValues.use[field] !== false) return field;
    if (entry.fields.has(field) || entry.dates.has(field)) return field;
  }
  return null;
}

/** Ano do labeldate: da data (date, urldate...) ou do campo year. */
function labelYearOf(entry: Entry, source: string | null): string {
  if (!source || source.startsWith('literal:')) return '';
  if (entry.dates.has(source)) return parseDate(entry.dates.get(source)!)?.start[0] ?? '';
  return plainText(entry.fields.get(source) ?? '');
}

/** Representação de um nome que conta para extraname e uniquelist: a base mais o que o uniquename mostra. */
function uniqueNameKey(name: Name, un: number, useprefix: boolean): string {
  const base = nameBase(name, useprefix);
  return un === 0 ? base : un === 1 ? `${base} ${givenInitials(name)}` : `${base} ${givenFull(name)}`;
}

function computeUniquename(entries: readonly Entry[], labels: Map<Entry, Labels>, mode: BiblatexOptions['uniquename']): void {
  if (mode === 'false') return;
  const all = mode === 'allinit' || mode === 'allfull';
  const minimal = mode === 'mininit' || mode === 'minfull';
  const allowFull = mode.endsWith('full');
  type Item = { entry: Entry; name: Name };
  const visibleNames = (entry: Entry): Name[] => {
    const label = labels.get(entry)!;
    if (!label.labelname) return [];
    const list = entry.names.get(label.labelname)!;
    // Lista já cortada no .bib com "and others": para o Biber, todos os nomes dela contam como visíveis.
    return all || list.more ? list.names : list.names.slice(0, label.visible);
  };
  // No modo min, só entram listas que, pela base, colidem com outra lista diferente.
  let scope: Entry[] = [...entries];
  if (minimal) {
    const byBase = new Map<string, Set<string>>();
    for (const entry of entries) {
      const useprefix = entry.optionValues.useprefix;
      const visible = visibleNames(entry);
      if (visible.length === 0) continue;
      const baseKey = visible.map((name) => nameBase(name, useprefix)).join('|');
      const fullKey = visible.map((name) => `${nameBase(name, useprefix)} ${givenFull(name)}`).join('|');
      byBase.set(baseKey, new Set([...(byBase.get(baseKey) ?? []), fullKey]));
    }
    scope = entries.filter((entry) => {
      const visible = visibleNames(entry);
      if (visible.length === 0) return false;
      return (byBase.get(visible.map((name) => nameBase(name, entry.optionValues.useprefix)).join('|'))?.size ?? 0) > 1;
    });
  }
  const items: Item[] = scope.flatMap((entry) => visibleNames(entry).map((name) => ({ entry, name })));
  const fullsByBase = new Map<string, Set<string>>();
  const fullsByInit = new Map<string, Set<string>>();
  for (const { entry, name } of items) {
    const base = nameBase(name, entry.optionValues.useprefix);
    const full = `${base} ${givenFull(name)}`;
    const init = `${base} ${givenInitials(name)}`;
    fullsByBase.set(base, new Set([...(fullsByBase.get(base) ?? []), full]));
    fullsByInit.set(init, new Set([...(fullsByInit.get(init) ?? []), full]));
  }
  for (const entry of entries) {
    const label = labels.get(entry)!;
    label.un = new Map();
    if (!label.labelname) continue;
    const useprefix = entry.optionValues.useprefix;
    const inScope = scope.includes(entry);
    const visible = new Set(inScope ? visibleNames(entry) : []);
    for (const name of entry.names.get(label.labelname)!.names) {
      if (!visible.has(name) || name.given.length === 0) {
        label.un.set(name, 0);
        continue;
      }
      const base = nameBase(name, useprefix);
      if ((fullsByBase.get(base)?.size ?? 0) <= 1) label.un.set(name, 0);
      else if ((fullsByInit.get(`${base} ${givenInitials(name)}`)?.size ?? 0) <= 1) label.un.set(name, 1);
      else label.un.set(name, allowFull ? 2 : 0);
    }
  }
}

function computeUniquelist(entries: readonly Entry[], labels: Map<Entry, Labels>, mode: BiblatexOptions['uniquelist']): void {
  if (mode === 'false') return;
  const keysOf = (entry: Entry): string[] | null => {
    const label = labels.get(entry)!;
    if (!label.labelname) return null;
    const list = entry.names.get(label.labelname)!;
    return list.names.map((name) => uniqueNameKey(name, label.un.get(name) ?? 0, entry.optionValues.useprefix));
  };
  const lists = entries.map((entry) => ({ entry, keys: keysOf(entry), year: labels.get(entry)!.labelyear }));
  for (const { entry, keys, year } of lists) {
    const label = labels.get(entry)!;
    label.ul = null;
    if (!keys) continue;
    const { maxcitenames: max, mincitenames: min } = entry.optionValues;
    const list = entry.names.get(label.labelname!)!;
    if (keys.length <= max && !list.more) continue;
    const others = lists.filter((other) => other.keys && other.entry !== entry && other.keys.join('|') !== keys.join('|') && (mode !== 'minyear' || other.year === year));
    let needed = min;
    while (needed < keys.length && others.some((other) => other.keys!.slice(0, needed).join('|') === keys.slice(0, needed).join('|'))) needed++;
    if (needed > min) label.ul = needed;
  }
}

/** Rótulo alfabético (labelalpha) pelo modelo: nomes, label, shorthand e ano. */
function labelalphaOf(entry: Entry, label: Labels, config: BiblatexConfig): string {
  const options = entry.optionValues;
  let out = '';
  for (const element of config.labelalpha) {
    for (const { field, options: fieldOptions } of element) {
      let text: string | null = null;
      if (field === 'labelname') {
        if (!label.labelname) continue;
        const list = entry.names.get(label.labelname)!;
        const total = list.names.length;
        const shown = total > options.maxalphanames ? Math.min(total, options.minalphanames) : total;
        const truncated = shown < total || list.more;
        if (fieldOptions.ifnames && Number(fieldOptions.ifnames) !== shown) continue;
        const width = Number(fieldOptions.strwidth ?? 1);
        text = list.names
          .slice(0, shown)
          .map((name) => {
            const family = plainText(partText(name.family)).replace(/[^\p{L}\p{N}]/gu, '');
            const prefix = options.useprefix && name.prefix.length > 0 ? plainText(partText(name.prefix)).replace(/[^\p{L}\p{N}]/gu, '').slice(0, 1) : '';
            const chars = [...family];
            return prefix + (fieldOptions.strside === 'right' ? chars.slice(-width) : chars.slice(0, width)).join('');
          })
          .join('');
        if (truncated) text += options.alphaothers;
      } else {
        const value = field === 'year' ? label.labelyear || plainText(entry.fields.get('year') ?? '') : plainText(entry.fields.get(field) ?? '');
        if (!value) continue;
        const chars = [...value.replace(/[^\p{L}\p{N}]/gu, '')];
        const width = fieldOptions.strwidth ? Number(fieldOptions.strwidth) : chars.length;
        text = (fieldOptions.strside === 'right' ? chars.slice(-width) : chars.slice(0, width)).join('');
        if (fieldOptions.final !== undefined && fieldOptions.final !== 'false' && text) return text;
      }
      if (text) {
        out += text;
        break;
      }
    }
  }
  return out;
}

// ---------- Ordenação ----------

/** Chave de ordenação de uma lista de nomes pelo modelo (\DeclareSortingNamekeyTemplate), com os nomes que contam. */
function sortNameString(entry: Entry, field: string, ul: number | null, template: SortingNamekeyTemplate): string | null {
  const list = entry.names.get(field);
  if (!list || entry.optionValues.use[field] === false) return null;
  const options = entry.optionValues;
  const [max, min] =
    template.visibility === 'cite'
      ? [options.maxcitenames, options.mincitenames]
      : template.visibility === 'bib'
        ? [options.maxbibnames, options.minbibnames]
        : [options.maxsortnames, options.minsortnames];
  const count = list.names.length > max ? Math.min(list.names.length, Math.max(min, ul ?? 0)) : list.names.length;
  return list.names
    .slice(0, count)
    .map((name) =>
      template.keyparts
        .map((keypart) =>
          keypart
            .filter(({ use }) => use === null || use === options.useprefix)
            .map(({ part, inits }) => {
              const pieces = name[part as keyof Name] ?? [];
              return inits ? pieces.map((word) => initialOf(word)).join(' ') : plainText(partText(pieces));
            })
            .filter(Boolean)
            .join(' '),
        )
        .filter(Boolean)
        .join(' '),
    )
    .join('  ');
}

interface SortExtras {
  labelalpha?: string;
  presort: string;
  namekey: SortingNamekeyTemplate;
  /** uniquelist da lista do labelname (que campo e quantos nomes). */
  labelname: string | null;
  ul: number | null;
}

function sortValue(entry: Entry, field: string, extras: SortExtras): string | null {
  if (field === 'presort') return entry.fields.get('presort') ?? extras.presort;
  if (field === 'labelalpha') return extras.labelalpha ?? null;
  if (field === 'entrykey') return entry.key;
  if (entry.names.has(field) || NAME_FIELDS.has(field)) return sortNameString(entry, field, field === extras.labelname ? extras.ul : null, extras.namekey);
  if (entry.lists.has(field)) return plainText(entry.lists.get(field)!.items.join(' '));
  if (['year', 'month', 'day'].includes(field) && !entry.fields.has(field)) {
    const date = entry.dates.get('date');
    const parsed = date ? parseDate(date) : null;
    if (!parsed) return field === 'month' && entry.fields.has('month') ? monthNumber(entry.fields.get('month')!) : null;
    const value = parsed.start[['year', 'month', 'day'].indexOf(field)]!;
    return value || null;
  }
  const value = entry.fields.get(field);
  if (value === undefined) return null;
  return plainText(field === 'month' ? monthNumber(value) : value);
}

interface SortKey {
  values: { value: string | number; descending: boolean }[];
  init: string;
}

function sortKeyOf(entry: Entry, specs: readonly SortSpec[], extras: SortExtras): SortKey {
  const values: SortKey['values'] = [];
  let init = '';
  for (const spec of specs) {
    let value: string | number = '';
    let defined = false;
    let fromPresort = false;
    for (const element of spec.elements) {
      let current: string | number | null = null;
      if (element.kind === 'citeorder') current = entry.citeorder;
      else if (element.kind === 'intciteorder') current = entry.intciteorder;
      else if (element.kind === 'citecount') current = 1;
      else if (element.kind === 'literal') current = element.value;
      else current = sortValue(entry, element.value, extras);
      if (current === null || current === '') continue;
      if (typeof current === 'string') {
        const { strside, strwidth, padside, padwidth, padchar } = element.options;
        if (strwidth) current = strside === 'right' ? current.slice(-Number(strwidth)) : current.slice(0, Number(strwidth));
        if (padwidth) current = padside === 'right' ? current.padEnd(Number(padwidth), padchar ?? ' ') : current.padStart(Number(padwidth), padchar ?? ' ');
      }
      value = current;
      defined = true;
      fromPresort = element.kind === 'field' && element.value === 'presort';
      break;
    }
    // sortinit: inicial do primeiro valor da ordenação que não seja o presort.
    if (!init && defined && !fromPresort) init = [...String(value)][0] ?? '';
    values.push({ value, descending: spec.descending });
    if (spec.final && defined) break;
  }
  return { values, init };
}

function compareKeys(a: SortKey, b: SortKey, collator: Intl.Collator): number {
  const length = Math.max(a.values.length, b.values.length);
  for (let i = 0; i < length; i++) {
    const x = a.values[i]?.value ?? '';
    const y = b.values[i]?.value ?? '';
    const descending = a.values[i]?.descending ?? b.values[i]?.descending ?? false;
    const result = typeof x === 'number' && typeof y === 'number' ? x - y : collator.compare(String(x), String(y));
    if (result !== 0) return descending ? -result : result;
  }
  return 0;
}

// ---------- Citações e fontes ----------

/**
 * Uma chave citada: `order` conta os comandos (\cite{a,b} dá a mesma ordem
 * às duas chaves, com `intorder` 1 e 2); no \nocite cada chave conta sozinha.
 */
export interface CiteRecord {
  key: string;
  order: number;
  intorder: number;
}

export interface BiblatexDocument {
  packageOptions: string;
  preamble: string;
  resources: string[];
  /** Citações por refsection, na ordem; '*' para \nocite{*}. */
  sections: CiteRecord[][];
  /** Contextos de referência pedidos no documento (\printbibliography[sorting=...], \newrefcontext...). */
  refcontexts: RefcontextSpec[];
  /** \printbiblist{shorthand} ou \printshorthands. */
  shorthandList: boolean;
  language: string;
}

const NOT_CITATIONS = new Set(['citeoption', 'citesetup', 'citereset', 'citetrackerfalse', 'citetrackertrue', 'citestyle', 'citeindexfalse', 'citeindextrue']);

/** Chaves citadas por comando do biblatex (\cite, \parencite, \textcite, \autocite, \cites..., \nocite). */
function citedKeys(text: string): { index: number; keys: string[]; nocite: boolean }[] {
  const found: { index: number; keys: string[]; nocite: boolean }[] = [];
  const re = /\\([a-zA-Z]*[cC]ite[a-zA-Z]*)\*?/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const command = match[1]!;
    if (NOT_CITATIONS.has(command.toLowerCase()) || /^(?:Declare|Rename|Delete|define|new|renew)/i.test(command)) continue;
    let i = re.lastIndex;
    const skipSpace = () => {
      while (/\s/.test(text[i] ?? '')) i++;
    };
    const group = (open: string, close: string): string | null => {
      skipSpace();
      if (text[i] !== open) return null;
      let depth = 0;
      for (let j = i; j < text.length; j++) {
        if (text[j] === '\\') {
          j++;
          continue;
        }
        if (text[j] === open) depth++;
        else if (text[j] === close && --depth === 0) {
          const value = text.slice(i + 1, j);
          i = j + 1;
          return value;
        }
      }
      return null;
    };
    const multi = /cites$/.test(command);
    // \cites(pre)(post)[pre][post]{a}[pre][post]{b}
    if (multi) {
      while (group('(', ')') !== null) {
        /* notas do grupo inteiro */
      }
    }
    const keys: string[] = [];
    for (;;) {
      while (group('[', ']') !== null) {
        /* notas antes e depois */
      }
      const start = i;
      let arg = group('{', '}');
      if (arg === null) {
        i = start;
        break;
      }
      // \volcite[pre]{volume}[pages]{key}: o primeiro grupo é o volume.
      if (/volcite/.test(command) && keys.length === 0) {
        while (group('[', ']') !== null) {
          /* páginas */
        }
        arg = group('{', '}') ?? arg;
      }
      keys.push(...arg.split(',').map((key) => key.trim()).filter((key) => key && !/\s/.test(key)));
      if (!multi) break;
    }
    if (keys.length > 0) found.push({ index: match.index, keys, nocite: command === 'nocite' });
    re.lastIndex = Math.max(i, re.lastIndex);
  }
  return found;
}

const BIBLATEX_PACKAGE = /\\(?:usepackage|RequirePackage)\s*(?:\[([^\]]*)\])?\s*\{([^}]*)\}/g;

/** Língua principal do babel (ou do polyglossia), para a ordem alfabética. */
function mainLanguage(preamble: string): string {
  const babel = /\\usepackage\s*\[([^\]]*)\]\s*\{babel\}/.exec(preamble);
  if (babel) {
    const options = babel[1]!.split(',').map((option) => option.trim()).filter(Boolean);
    const main = options.find((option) => option.startsWith('main='));
    return main ? main.slice(5) : (options.at(-1) ?? '');
  }
  return /\\setdefaultlanguage\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}/.exec(preamble)?.[1]?.trim() ?? /\\setmainlanguage\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}/.exec(preamble)?.[1]?.trim() ?? '';
}

const LOCALES: Record<string, string> = {
  brazil: 'pt-BR', brazilian: 'pt-BR', portuguese: 'pt', portuges: 'pt', spanish: 'es', french: 'fr', francais: 'fr', german: 'de',
  ngerman: 'de', austrian: 'de', naustrian: 'de', italian: 'it', english: 'en', american: 'en-US', british: 'en-GB', usenglish: 'en-US',
  catalan: 'ca', dutch: 'nl', polish: 'pl', czech: 'cs', swedish: 'sv', danish: 'da', norsk: 'nb', finnish: 'fi',
};

/** Usa biblatex? Lê o pacote (no principal, nos \input ou num .sty do projeto), as fontes e as citações. */
export function scanBiblatex(texts: ReadonlyMap<string, string>, mainPath: string): BiblatexDocument | null {
  const source = flattenLatex(texts, mainPath);
  const parts = splitDocument(source);
  const localStyles = [...texts].filter(([path]) => /\.(sty|cls)$/.test(path)).map(([, content]) => stripComments(content));
  const preamble = [parts ? parts.preamble : source, ...localStyles].join('\n');
  let packageOptions: string | null = null;
  for (const match of preamble.matchAll(BIBLATEX_PACKAGE)) {
    if (match[2]!.split(',').some((name) => name.trim() === 'biblatex')) packageOptions = packageOptions === null ? (match[1] ?? '') : `${packageOptions},${match[1] ?? ''}`;
  }
  if (packageOptions === null) return null;
  const resources = [
    ...[...preamble.matchAll(/\\add(?:bibresource|globalbib|sectionbib)\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}/g)].map((match) => match[1]!.trim()),
    ...[...source.matchAll(/\\bibliography\s*\{([^}]+)\}/g)].flatMap((match) => match[1]!.split(',').map((name) => `${name.trim()}.bib`.replace(/\.bib\.bib$/, '.bib'))),
  ];
  // Refsections: cada \begin{refsection} ou \newrefsection abre uma nova; depois do \end volta à 0.
  const sections: CiteRecord[][] = [[]];
  const orders = [0];
  const boundaries = [...source.matchAll(/\\begin\s*\{refsection\}|\\end\s*\{refsection\}|\\newrefsection\b/g)].map((match) => ({ index: match.index!, kind: match[0] }));
  const cites = citedKeys(source);
  let current = 0;
  let boundary = 0;
  for (const cite of cites) {
    while (boundary < boundaries.length && boundaries[boundary]!.index < cite.index) {
      const kind = boundaries[boundary]!.kind;
      if (kind.startsWith('\\end')) current = 0;
      else {
        sections.push([]);
        orders.push(0);
        current = sections.length - 1;
      }
      boundary++;
    }
    if (cite.nocite) cite.keys.forEach((key) => sections[current]!.push({ key, order: ++orders[current]!, intorder: 1 }));
    else {
      const order = ++orders[current]!;
      cite.keys.forEach((key, index) => sections[current]!.push({ key, order, intorder: index + 1 }));
    }
  }
  while (boundary < boundaries.length) {
    if (!boundaries[boundary]!.kind.startsWith('\\end')) sections.push([]);
    boundary++;
  }
  return {
    packageOptions,
    preamble,
    resources,
    sections,
    refcontexts: refcontextsIn(parts ? parts.body : source),
    shorthandList: /\\printshorthands\b|\\printbiblist\s*(?:\[[^\]]*\])?\s*\{shorthand\}/.test(source),
    language: mainLanguage(preamble),
  };
}

function preamblesOf(content: string): string[] {
  const found: string[] = [];
  const re = /@preamble\s*([{(])/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    const open = match.index + match[0].length - 1;
    let depth = 0;
    let end = -1;
    for (let i = open; i < content.length; i++) {
      if (content[i] === '{' || content[i] === '(') depth++;
      else if ((content[i] === '}' || content[i] === ')') && --depth === 0) {
        end = i;
        break;
      }
    }
    if (end < 0) break;
    const body = content.slice(open + 1, end).trim();
    const pieces = splitTopLevel(body, '#').map((piece) => piece.trim().replace(/^"([\s\S]*)"$/, '$1').replace(/^\{([\s\S]*)\}$/, '$1'));
    found.push(pieces.join(''));
    re.lastIndex = end + 1;
  }
  return found;
}

// ---------- Saída ----------

const HEADER = String.raw`% $ biblatex auxiliary file $
% $ biblatex bbl format version 3.3 $
% Do not modify the above lines!
%
% This is an auxiliary file used by the 'biblatex' package.
% This file may safely be deleted. It will be recreated by
% biber as required.
%
% Gerado pelo OverDocTeX (biblatex sem Biber, no navegador).
%
\begingroup
\makeatletter
\@ifundefined{ver@biblatex.sty}
  {\@latex@error
     {Missing 'biblatex' package}
     {The bibliography requires the 'biblatex' package.}
      \aftergroup\endinput}
  {}
\endgroup
`;

function nameLines(field: string, list: NameList, un: Map<Name, number> | null, ul: number | null, useprefix: boolean): string[] {
  const lines: string[] = [];
  lines.push(`      \\name{${field}}{${list.names.length}}{${ul ? `ul=${ul}` : ''}}{%`);
  for (const name of list.names) {
    const hash = md5Hex(nameHashString(name));
    const value = un?.get(name);
    const head = value !== undefined ? `{{un=${value},uniquepart=${value === 0 ? 'base' : 'given'},hash=${hash}}{%` : `{{hash=${hash}}{%`;
    const parts: string[] = [];
    const add = (part: 'family' | 'given' | 'prefix' | 'suffix') => {
      const pieces = name[part];
      if (pieces.length === 0) return;
      parts.push(`${part}={${joinNamePart(pieces)}}`, `${part}i={${initials(pieces)}}`);
      // Partes de fora da base levam o próprio uniquename (o prefixo só é base com useprefix).
      if (value !== undefined && part !== 'family' && !(part === 'prefix' && useprefix)) parts.push(`${part}un=${part === 'given' ? value : 0}`);
    };
    add('family');
    add('given');
    add('prefix');
    add('suffix');
    lines.push(`        ${head}`);
    parts.forEach((part, index) => lines.push(`           ${part}${index === parts.length - 1 ? '}}%' : ','}`));
  }
  lines.push('      }');
  return lines;
}

interface Extras {
  extraname: Map<Entry, number>;
  extradate: Map<Entry, number>;
  extraalpha: Map<Entry, number>;
  singletitle: Set<Entry>;
  uniquetitle: Set<Entry>;
  uniquebaretitle: Set<Entry>;
  uniquework: Set<Entry>;
  uniqueprimaryauthor: Set<Entry>;
}

/** Numera, na ordem da lista, as entradas que repetem a mesma chave (só grupos com mais de uma). */
function numberRepeats(sorted: readonly Entry[], keyOf: (entry: Entry) => string | null): Map<Entry, number> {
  const groups = new Map<string, Entry[]>();
  for (const entry of sorted) {
    const key = keyOf(entry);
    if (key === null) continue;
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  const numbers = new Map<Entry, number>();
  for (const group of groups.values()) if (group.length > 1) group.forEach((entry, index) => numbers.set(entry, index + 1));
  return numbers;
}

function entryLines(
  entry: Entry,
  label: Labels,
  sortKey: SortKey,
  extras: Extras,
  datamodel: Datamodel,
  labelalpha: string | null,
  /** uniquename de uma lista que não é a do labelname (herdada do labelname de um pai na bibliografia). */
  inheritedUn: (entry: Entry, field: string) => number[] | null,
  included: ReadonlySet<string>,
): string[] {
  const options = entry.optionValues;
  const lines = [`    \\entry{${entry.key}}{${entry.type}}{${entry.options.join(',')}}{}`];
  const nameFields = [...entry.names.keys()].filter((field) => field !== 'sortname').sort();
  for (const field of nameFields) {
    const list = entry.names.get(field)!;
    if (list.more) lines.push(`      \\true{more${field}}`);
    if (list.more && field === label.labelname) lines.push('      \\true{morelabelname}');
    let un: Map<Name, number> | null = null;
    if (options.uniquename !== 'false') {
      const inherited = field === label.labelname ? null : inheritedUn(entry, field);
      if (field === label.labelname) un = label.un;
      else if (inherited) un = new Map(list.names.map((name, index) => [name, inherited[index] ?? 0]));
    }
    lines.push(...nameLines(field, list, un, field === label.labelname ? label.ul : null, options.useprefix));
  }
  for (const field of [...entry.lists.keys()].sort()) {
    const list = entry.lists.get(field)!;
    if (list.more) lines.push(`      \\true{more${field}}`);
    lines.push(`      \\list{${field}}{${list.items.length}}{%`, ...list.items.map((item) => `        {${item}}%`), '      }');
  }
  // Hashes: da lista do labelname (com uniquelist) e de cada lista de nomes.
  const hashes: string[] = [];
  const hashFor = (field: string, isLabel: boolean) => {
    const list = entry.names.get(field)!;
    const ul = isLabel ? label.ul : null;
    const cite = visibleCount(list, options.maxcitenames, options.mincitenames, ul);
    const bib = visibleCount(list, options.maxbibnames, options.minbibnames, ul);
    return { name: listHash(list, cite, options.nohashothers), full: listHash(list, list.names.length, options.nohashothers), bib: listHash(list, bib, options.nohashothers) };
  };
  if (label.labelname) {
    const own = hashFor(label.labelname, true);
    hashes.push(`      \\strng{namehash}{${own.name}}`);
    if (label.fullname) hashes.push(`      \\strng{fullhash}{${hashFor(label.fullname, label.fullname === label.labelname).full}}`);
    hashes.push(`      \\strng{bibnamehash}{${own.bib}}`);
  }
  for (const field of nameFields) {
    const own = hashFor(field, field === label.labelname);
    hashes.push(`      \\strng{${field}bibnamehash}{${own.bib}}`, `      \\strng{${field}namehash}{${own.name}}`, `      \\strng{${field}fullhash}{${own.full}}`);
  }
  lines.push(...hashes);
  if (extras.extraname.has(entry)) lines.push(`      \\field{extraname}{${extras.extraname.get(entry)}}`);
  if (labelalpha !== null) lines.push(`      \\field{labelalpha}{${labelalpha}}`);
  const init = sortKey.init;
  lines.push(`      \\field{sortinit}{${init}}`, `      \\field{sortinithash}{${md5Hex(init.normalize('NFD').replace(/\p{M}/gu, ''))}}`);
  if (options.labeldateparts) {
    if (extras.extradate.has(entry)) lines.push(`      \\field{extradate}{${extras.extradate.get(entry)}}`);
    lines.push('      \\field{extradatescope}{labelyear}');
    if (label.labeldatesource !== null) lines.push(`      \\field{labeldatesource}{${label.labeldatesource}}`);
  }
  if (extras.extraalpha.has(entry)) lines.push(`      \\field{extraalpha}{${extras.extraalpha.get(entry)}}`);
  if (label.labelname) lines.push(`      \\field{labelnamesource}{${label.labelname}}`);
  if (label.labeltitle) lines.push(`      \\field{labeltitlesource}{${label.labeltitle}}`);
  for (const [flag, set] of [
    ['singletitle', extras.singletitle],
    ['uniquetitle', extras.uniquetitle],
    ['uniquebaretitle', extras.uniquebaretitle],
    ['uniquework', extras.uniquework],
    ['uniqueprimaryauthor', extras.uniqueprimaryauthor],
  ] as const) {
    if (set.has(entry)) lines.push(`      \\true{${flag}}`);
  }

  // Campos comuns, datas e referências, em ordem alfabética; depois intervalos e campos literais (\verb).
  const plain = new Map<string, string>();
  const eras: string[] = [];
  for (const [field, value] of entry.fields) {
    if (SORT_ONLY_FIELDS.has(field) || datamodel.verbatim.has(field) || datamodel.ranges.has(field)) continue;
    if (field === 'keywords' || field === 'options' || field === 'crossref' || field === 'xref' || field === 'xdata' || field === 'ids') continue;
    if (!datamodel.literals.has(field)) continue;
    if ((field === 'year' || field === 'month') && entry.dates.has('date')) continue;
    plain.set(field, field === 'month' ? monthNumber(value) : value);
  }
  for (const [field, value] of entry.dates) {
    const prefix = DATE_FIELDS[field] ?? field.replace(/date$/, '');
    const parsed = parseDate(value);
    if (!parsed) continue;
    const [year, month, day] = parsed.start;
    const era = year.startsWith('-') ? 'bce' : 'ce';
    plain.set(`${prefix}year`, year.replace(/^-/, ''));
    if (month) plain.set(`${prefix}month`, month);
    if (day) plain.set(`${prefix}day`, day);
    if (parsed.end) {
      const [endYear, endMonth, endDay] = parsed.end;
      plain.set(`${prefix}endyear`, endYear.replace(/^-/, ''));
      if (endMonth) plain.set(`${prefix}endmonth`, endMonth);
      if (endDay) plain.set(`${prefix}endday`, endDay);
      eras.push(`      \\field{${prefix}enddateera}{${endYear.startsWith('-') ? 'bce' : 'ce'}}`);
    } else if (parsed.open) plain.set(`${prefix}endyear`, '');
    eras.push(`      \\field{${prefix}dateera}{${era}}`);
  }
  for (const reference of ['crossref', 'xref']) {
    const target = entry.fields.get(reference);
    if (target && included.has(target)) plain.set(reference, target);
  }
  for (const field of [...plain.keys()].sort()) {
    lines.push(field === 'crossref' || field === 'xref' ? `      \\strng{${field}}{${plain.get(field)}}` : `      \\field{${field}}{${plain.get(field)}}`);
  }
  lines.push(...eras);
  const keywords = entry.fields.get('keywords');
  if (keywords) lines.push(`      \\keyw{${keywords.split(',').map((word) => word.trim()).filter(Boolean).join(',')}}`);
  for (const field of [...datamodel.ranges].filter((name) => entry.fields.has(name)).sort()) {
    const { text, count } = formatRange(entry.fields.get(field)!);
    lines.push(`      \\field{${field}}{${text}}`, `      \\range{${field}}{${count}}`);
  }
  for (const field of [...datamodel.verbatim].filter((name) => entry.fields.has(name))) {
    const value = entry.fields.get(field)!;
    if (field === 'url') lines.push('      \\verb{urlraw}', `      \\verb ${value}`, '      \\endverb', '      \\verb{url}', `      \\verb ${escapeUrl(value)}`, '      \\endverb');
    else lines.push(`      \\verb{${field}}`, `      \\verb ${value}`, '      \\endverb');
  }
  lines.push('    \\endentry');
  return lines;
}

export interface BiblatexBblResult {
  bbl: string;
  /** Citações sem entrada nos .bib (o biblatex mostra a chave em negrito). */
  missing: string[];
}

/**
 * Monta o .bbl do biblatex. `styleFile` devolve o texto de um estilo
 * (.bbx, .cbx, .dbx) pelo nome, para ler as opções que ele define; nulo se
 * não houver (valem os padrões do biblatex e as opções do documento).
 */
export function buildBiblatexBbl(
  texts: ReadonlyMap<string, string>,
  mainPath: string,
  styleFile: (name: string) => string | null = () => null,
): BiblatexBblResult | null {
  const document = scanBiblatex(texts, mainPath);
  if (!document) return null;
  const config = readBiblatexConfig({ packageOptions: document.packageOptions, preamble: document.preamble, styleFile });
  const datamodel = datamodelOf(config);
  const folder = mainPath.includes('/') ? mainPath.slice(0, mainPath.lastIndexOf('/') + 1) : '';

  // Bancos: o caminho do \addbibresource é relativo à pasta do principal.
  const strings = new Map<string, string>();
  const byKey = new Map<string, BibEntry>();
  const lowerKeys = new Map<string, string>();
  const preambles: string[] = [];
  const order: string[] = [];
  for (const resource of [...new Set(document.resources)]) {
    // O biblatex pede o nome com a extensão; sem ela, tenta também com .bib.
    const candidates = [resource, `${resource}.bib`].flatMap((name) => [`${folder}${name}`.replace(/^\.\//, '').replace(/\/\.\//g, '/'), name]);
    const content = candidates.map((path) => texts.get(path)).find((text) => text !== undefined);
    if (content === undefined) continue;
    preambles.push(...preamblesOf(content));
    for (const raw of parseBibFile(content, strings, MONTH_NUMBERS)) {
      if (byKey.has(raw.key)) continue;
      byKey.set(raw.key, applySourcemaps(raw, config.sourcemaps));
      lowerKeys.set(raw.key.toLowerCase(), raw.key);
      order.push(raw.key);
    }
  }
  const collator = new Intl.Collator(LOCALES[document.language.toLowerCase()] ?? 'en', {
    sensitivity: config.options.sortcase ? 'variant' : 'accent',
    caseFirst: config.options.sortupper ? 'upper' : 'lower',
  });

  const out: string[] = [HEADER];
  if (preambles.length > 0) out.push('\\preamble{%', `${preambles.join('%\n')}%`, '}', '');
  out.push('');
  const missingAll: string[] = [];
  document.sections.forEach((records, section) => {
    const cited = records.map((record) => record.key);
    // Chaves citadas (na ordem), as de \nocite{*}, e os pais de crossref citados mincrossrefs vezes.
    const wantsAll = cited.includes('*');
    const chosen: string[] = [];
    const missing: string[] = [];
    for (const key of cited) {
      if (key === '*') continue;
      const real = byKey.has(key) ? key : lowerKeys.get(key.toLowerCase());
      if (!real || !byKey.has(real)) {
        if (!missing.includes(key)) missing.push(key);
      } else if (!chosen.includes(real)) chosen.push(real);
    }
    if (wantsAll) for (const key of order) if (!chosen.includes(key) && byKey.get(key)!.type !== 'xdata') chosen.push(key);
    const crossrefCount = new Map<string, number>();
    const xrefCount = new Map<string, number>();
    for (const key of chosen) {
      const raw = byKey.get(key)!;
      const crossref = raw.fields.get('crossref');
      const xref = raw.fields.get('xref');
      if (crossref) crossrefCount.set(crossref, (crossrefCount.get(crossref) ?? 0) + 1);
      if (xref) xrefCount.set(xref, (xrefCount.get(xref) ?? 0) + 1);
    }
    for (const [key, count] of crossrefCount) if (count >= config.options.mincrossrefs && byKey.has(key) && !chosen.includes(key)) chosen.push(key);
    for (const [key, count] of xrefCount) if (count >= config.options.minxrefs && byKey.has(key) && !chosen.includes(key)) chosen.push(key);
    const included = new Set(chosen);

    const inheritedFields = new Map<string, Set<string>>();
    const entries = chosen.map((key, index) => {
      const raw: BibEntry = { key, type: byKey.get(key)!.type, fields: new Map(byKey.get(key)!.fields) };
      for (const xdata of (raw.fields.get('xdata') ?? '').split(',').map((name) => name.trim()).filter(Boolean)) {
        const parent = byKey.get(xdata);
        if (parent) for (const [field, value] of parent.fields) if (!raw.fields.has(field) && !NEVER_INHERITED.has(field)) raw.fields.set(field, value);
      }
      const crossref = raw.fields.get('crossref');
      if (crossref && byKey.has(crossref)) inheritedFields.set(key, inherit(raw, byKey.get(crossref)!));
      const entry = buildEntry(raw, config, datamodel);
      // Ordem da primeira citação; as de \nocite{*} e os pais de crossref vêm na ordem do .bib, depois.
      const record = records.find((candidate) => candidate.key === key || candidate.key.toLowerCase() === key.toLowerCase());
      const all = records.find((candidate) => candidate.key === '*');
      entry.citeorder = record?.order ?? all?.order ?? (records.at(-1)?.order ?? 0) + 1;
      entry.intciteorder = record?.intorder ?? index + 1;
      return entry;
    });

    // Rótulos: labelname, labeltitle, labeldate; depois uniquename e uniquelist (duas voltas, uma depende da outra).
    const labels = new Map<Entry, Labels>();
    for (const entry of entries) {
      const labelname = firstDefined(entry, config.labelname.filter((field) => !field.startsWith('literal:')));
      const labeltitle = firstDefined(entry, config.labeltitle.filter((field) => !field.startsWith('literal:')));
      const dateSource = firstDefined(entry, config.labeldate);
      const labeldatesource = dateSource === null ? null : dateSource.startsWith('literal:') ? dateSource.slice(8) : dateSource === 'year' ? '' : (DATE_FIELDS[dateSource] ?? dateSource.replace(/date$/, ''));
      const fullname = firstDefined(entry, config.labelname.filter((field) => !field.startsWith('literal:') && !field.startsWith('short')));
      const label: Labels = { labelname, fullname, labeltitle, labeldatesource, labelyear: labelYearOf(entry, dateSource), visible: 0, ul: null, un: new Map() };
      label.visible = labelname ? visibleCount(entry.names.get(labelname)!, entry.optionValues.maxcitenames, entry.optionValues.mincitenames, null) : 0;
      labels.set(entry, label);
    }
    for (let round = 0; round < 2; round++) {
      computeUniquename(entries, labels, config.options.uniquename);
      computeUniquelist(entries, labels, config.options.uniquelist);
      for (const entry of entries) {
        const label = labels.get(entry)!;
        if (label.labelname) label.visible = visibleCount(entry.names.get(label.labelname)!, entry.optionValues.maxcitenames, entry.optionValues.mincitenames, label.ul);
      }
    }
    const labelalphas = new Map<Entry, string>();
    if (config.options.labelalpha) for (const entry of entries) labelalphas.set(entry, labelalphaOf(entry, labels.get(entry)!, config));
    // Campos de nomes anotados com uniquename: os que servem de labelname em alguma entrada.
    // O Biber anota o uniquename só no labelname; a lista herdada do labelname de um pai que também
    // está na bibliografia sai anotada igual à do pai.
    const byEntryKey = new Map(entries.map((entry) => [entry.key, entry]));
    const inheritedUn = (entry: Entry, field: string): number[] | null => {
      const parentKey = entry.fields.get('crossref');
      const parent = parentKey ? byEntryKey.get(parentKey) : undefined;
      if (!parent || !inheritedFields.get(entry.key)?.has(field)) return null;
      const parentLabel = labels.get(parent)!;
      if (parentLabel.labelname !== field) return null;
      return parent.names.get(field)!.names.map((name) => parentLabel.un.get(name) ?? 0);
    };

    const uniqueNameHash = (entry: Entry): string | null => {
      const label = labels.get(entry)!;
      if (!label.labelname) return null;
      const list = entry.names.get(label.labelname)!;
      const names = list.names.slice(0, label.visible).map((name) => uniqueNameKey(name, label.un.get(name) ?? 0, entry.optionValues.useprefix));
      return names.join('|') + (label.visible < list.names.length || list.more ? '+' : '');
    };

    const datalist = (context: Required<RefcontextSpec>, filter: (entry: Entry) => boolean, kind: 'entry' | 'list') => {
      const sorting = context.sorting;
      const specs = config.sortingTemplates.get(sorting) ?? config.sortingTemplates.get('nty')!;
      const namekey = config.sortingNamekeyTemplates.get(context.sortingnamekeytemplatename) ?? config.sortingNamekeyTemplates.get('global')!;
      const keys = new Map(
        entries.map((entry) => {
          const label = labels.get(entry)!;
          return [entry, sortKeyOf(entry, specs, { labelalpha: labelalphas.get(entry), presort: config.presort, namekey, labelname: label.labelname, ul: label.ul })];
        }),
      );
      const sorted = entries.filter(filter).sort((a, b) => compareKeys(keys.get(a)!, keys.get(b)!, collator) || a.citeorder - b.citeorder);
      const extras: Extras = {
        extraname: numberRepeats(sorted, uniqueNameHash),
        extradate: config.options.labeldateparts
          ? numberRepeats(sorted, (entry) => {
              const label = labels.get(entry)!;
              const who = uniqueNameHash(entry) ?? (label.labeltitle ? `title:${plainText(entry.fields.get(label.labeltitle) ?? '')}` : null);
              return who === null ? null : `${who}@${label.labelyear}`;
            })
          : new Map(),
        extraalpha: config.options.labelalpha ? numberRepeats(sorted, (entry) => labelalphas.get(entry) ?? null) : new Map(),
        singletitle: new Set(),
        uniquetitle: new Set(),
        uniquebaretitle: new Set(),
        uniquework: new Set(),
        uniqueprimaryauthor: new Set(),
      };
      const count = (keyOf: (entry: Entry) => string | null) => {
        const counts = new Map<string, number>();
        for (const entry of sorted) {
          const key = keyOf(entry);
          if (key !== null) counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        return (entry: Entry) => {
          const key = keyOf(entry);
          return key !== null && counts.get(key) === 1;
        };
      };
      const titleOf = (entry: Entry) => {
        const label = labels.get(entry)!;
        return label.labeltitle ? plainText(entry.fields.get(label.labeltitle) ?? '') : null;
      };
      const flag = (enabled: boolean, set: Set<Entry>, test: (entry: Entry) => boolean) => {
        if (enabled) for (const entry of sorted) if (test(entry)) set.add(entry);
      };
      // singletitle e uniquework, como no Biber, olham a lista inteira de nomes (o fullhash), ou o título sem nomes.
      const fullNames = (entry: Entry) => {
        const label = labels.get(entry)!;
        if (!label.labelname) return null;
        const list = entry.names.get(label.labelname)!;
        return listHash(list, list.names.length, false);
      };
      flag(config.options.singletitle, extras.singletitle, count((entry) => fullNames(entry) ?? (titleOf(entry) === null ? null : `title:${titleOf(entry)}`)));
      flag(config.options.uniquetitle, extras.uniquetitle, count(titleOf));
      flag(config.options.uniquebaretitle, extras.uniquebaretitle, count((entry) => (labels.get(entry)!.labelname ? null : titleOf(entry))));
      flag(config.options.uniquework, extras.uniquework, count((entry) => `${fullNames(entry) ?? ''}#${titleOf(entry) ?? ''}`));
      // uniqueprimaryauthor: o sobrenome do primeiro autor, entre os primeiros autores, é de uma pessoa só.
      if (config.options.uniqueprimaryauthor) {
        const primary = new Map<string, { entries: number; people: Set<string> }>();
        const firstOf = (entry: Entry) => {
          const label = labels.get(entry)!;
          return label.labelname ? entry.names.get(label.labelname)!.names[0] : undefined;
        };
        for (const entry of sorted) {
          const first = firstOf(entry);
          if (!first) continue;
          const base = plainText(partText(first.family));
          const seen = primary.get(base) ?? { entries: 0, people: new Set<string>() };
          seen.entries++;
          seen.people.add(`${base} ${givenFull(first)}`);
          primary.set(base, seen);
        }
        for (const entry of sorted) {
          const first = firstOf(entry);
          const seen = first ? primary.get(plainText(partText(first.family))) : undefined;
          if (seen && seen.people.size === 1) extras.uniqueprimaryauthor.add(entry);
        }
      }
      const name = [sorting, context.sortingnamekeytemplatename, context.labelprefix, context.uniquenametemplatename, context.labelalphanametemplatename, context.namehashtemplatename].join('/');
      const lines = [`  \\datalist[${kind}]{${name}}`];
      for (const entry of sorted) {
        lines.push(...entryLines(entry, labels.get(entry)!, keys.get(entry)!, extras, datamodel, labelalphas.has(entry) ? labelalphas.get(entry)! : null, inheritedUn, included));
      }
      lines.push('  \\enddatalist');
      return lines;
    };

    out.push(`\\refsection{${section}}`);
    // Uma lista por contexto: o global e os pedidos pelo estilo ou pelo documento (sem repetir).
    const contextOf = (spec: RefcontextSpec): Required<RefcontextSpec> => ({
      sorting: spec.sorting ?? config.options.sorting,
      sortingnamekeytemplatename: spec.sortingnamekeytemplatename ?? 'global',
      labelprefix: spec.labelprefix ?? '',
      uniquenametemplatename: spec.uniquenametemplatename ?? 'global',
      labelalphanametemplatename: spec.labelalphanametemplatename ?? 'global',
      namehashtemplatename: spec.namehashtemplatename ?? 'global',
    });
    const contexts = new Map<string, Required<RefcontextSpec>>();
    for (const spec of [{}, ...config.refcontexts, ...document.refcontexts]) {
      const context = contextOf(spec);
      contexts.set(Object.values(context).join('/'), context);
    }
    for (const context of contexts.values()) out.push(...datalist(context, () => true, 'entry'));
    if (document.shorthandList) out.push(...datalist(contextOf({ sorting: 'shorthand' }), (entry) => entry.fields.has('shorthand'), 'list'));
    for (const key of missing) out.push(`  \\missing{${key}}`);
    out.push('\\endrefsection');
    missingAll.push(...missing);
  });
  out.push('\\endinput', '');
  return { bbl: out.join('\n'), missing: [...new Set(missingAll)] };
}
