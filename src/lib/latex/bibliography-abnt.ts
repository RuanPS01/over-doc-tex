/**
 * Estilo ABNT do abnTeX2 (puro): o `.bbl` que o bibtex produziria com
 * abntex2-alf.bst (citação autor-data) ou abntex2-num.bst (numérica), que o
 * pacote abntex2cite espera. Cada entrada leva \abntrefinfo{Autor}{AUTOR}{ano},
 * de onde o \cite e o \citeonline tiram o texto da citação; sem isso eles
 * imprimem "??".
 *
 * Segue o .bst da versão do TeX Live 2025 (v-1.9.7) com as opções padrão:
 * sobrenome em maiúsculas e iniciais, "et al." acima de 3 autores, título em
 * \emph, "Disponível em" e "Acesso em". O campo doi é ignorado, como no .bst.
 * Opções de \citeoption que mudam isso: abnt-emphasize, abnt-etal-list,
 * abnt-etal-cite, abnt-dont-use-etal e abnt-and-type.
 */
import { initials, isOthers, people, type Person } from './bib-names';
import type { BibEntry } from './bibliography';

export interface AbntOptions {
  /** abntex2cite [alf]: autor-data, ordem alfabética. Senão, numérica na ordem de citação. */
  alf: boolean;
  /** Comando de destaque do título (\emph por padrão, \textbf com abnt-emphasize=bf). */
  emphasize: string;
  /** Na referência, mais autores que isso viram "PRIMEIRO et al." (0: nunca). */
  etalList: number;
  /** Na citação, mais autores que isso viram "Primeiro et al." (0: nunca). */
  etalCite: number;
  /** Conector do último autor na citação. */
  and: string;
}

export const DEFAULT_ABNT_OPTIONS: AbntOptions = { alf: true, emphasize: '\\emph', etalList: 3, etalCite: 3, and: ' e ' };

/** Opções do abntex2cite (do \usepackage e de \citeoption) aplicadas sobre as padrão. */
export function abntOptionsFrom(packageOptions: readonly string[], citeOptions: readonly string[]): AbntOptions {
  const options: AbntOptions = { ...DEFAULT_ABNT_OPTIONS, alf: packageOptions.includes('alf') };
  for (const raw of [...packageOptions, ...citeOptions]) {
    const [name, value = ''] = raw.split('=').map((part) => part.trim());
    if (name === 'abnt-emphasize') options.emphasize = value === 'bf' ? '\\textbf' : value === 'em' ? '\\emph' : options.emphasize;
    else if (name === 'abnt-etal-list' && /^\d+$/.test(value)) options.etalList = Number(value);
    else if (name === 'abnt-etal-cite' && /^\d+$/.test(value)) options.etalCite = Number(value);
    else if (name === 'abnt-dont-use-etal') options.etalList = value === 'yes' ? 0 : 3;
    else if (name === 'abnt-and-type') options.and = value === '&' ? ' \\& ' : ' e ';
  }
  return options;
}

// ---------- Texto: maiúsculas, minúsculas e ordenação (como o change.case$ e o purify$ do bibtex)

type CaseMode = 'upper' | 'lower' | 'title';

const FOREIGN: Record<string, { upper: string; lower: string }> = {
  i: { upper: 'I', lower: '\\i' },
  j: { upper: 'J', lower: '\\j' },
  oe: { upper: '\\OE', lower: '\\oe' },
  OE: { upper: '\\OE', lower: '\\oe' },
  ae: { upper: '\\AE', lower: '\\ae' },
  AE: { upper: '\\AE', lower: '\\ae' },
  aa: { upper: '\\AA', lower: '\\aa' },
  AA: { upper: '\\AA', lower: '\\aa' },
  o: { upper: '\\O', lower: '\\o' },
  O: { upper: '\\O', lower: '\\o' },
  l: { upper: '\\L', lower: '\\l' },
  L: { upper: '\\L', lower: '\\l' },
  ss: { upper: 'SS', lower: '\\ss' },
};

const convert = (text: string, upper: boolean) => (upper ? text.toLocaleUpperCase('pt-BR') : text.toLocaleLowerCase('pt-BR'));

/** Letras de um caractere especial ({\'e}, {\c c}): nomes de comando ficam, exceto os de letra estrangeira. */
function convertSpecial(group: string, upper: boolean): string {
  return group.replace(/\\([a-zA-Z]+)|\\.|[^\\]+/g, (match, command: string | undefined) => {
    if (command) {
      const foreign = FOREIGN[command];
      return foreign ? (upper ? foreign.upper : foreign.lower) : match;
    }
    return match.startsWith('\\') ? match : convert(match, upper);
  });
}

/**
 * Troca de caixa fora das chaves. Grupos {\...} são caracteres especiais e
 * mudam as letras; outros grupos ficam como estão. No modo título só a
 * primeira letra e a que vem depois de ": " mantêm a caixa.
 */
export function changeCase(text: string, mode: CaseMode): string {
  let out = '';
  let prevColon = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    const keep = mode === 'title' && (i === 0 || (prevColon && /\s/.test(text[i - 1] ?? '')));
    if (char === '{') {
      let depth = 0;
      let end = i;
      for (; end < text.length; end++) {
        if (text[end] === '\\') {
          end++;
          continue;
        }
        if (text[end] === '{') depth++;
        else if (text[end] === '}' && --depth === 0) break;
      }
      const group = text.slice(i, end + 1);
      out += text[i + 1] === '\\' && !keep ? convertSpecial(group, mode === 'upper') : group;
      i = end;
      prevColon = false;
      continue;
    }
    if (char === '\\') {
      // Comando fora de chaves: o nome fica (o bibtex o estragaria; aqui não).
      const command = /^\\(?:[a-zA-Z]+|.)/.exec(text.slice(i))![0];
      out += command;
      i += command.length - 1;
      prevColon = false;
      continue;
    }
    out += keep ? char : convert(char, mode === 'upper');
    if (char === ':') prevColon = true;
    else if (!/\s/.test(char)) prevColon = false;
  }
  return out;
}

const PURIFY_LETTERS: Record<string, string> = { i: 'i', j: 'j', oe: 'oe', OE: 'OE', ae: 'ae', AE: 'AE', aa: 'a', AA: 'A', o: 'o', O: 'O', l: 'l', L: 'L', ss: 'ss' };

/** Texto para ordenar: sem comandos, acentos e pontuação, em minúsculas (purify$ e "l" change.case$). */
export function sortify(text: string): string {
  return text
    .replace(/\\([a-zA-Z]+)\s*|\\./g, (_, command: string | undefined) => (command ? (PURIFY_LETTERS[command] ?? '') : ''))
    .replace(/[{}]/g, '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[-~]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .toLowerCase();
}

/** add.period$: ponto final, salvo se o texto já termina em . ? ou ! (ignorando chaves). */
function addPeriod(text: string): string {
  if (!text) return text;
  const last = text.replace(/\}+$/, '').slice(-1);
  return /[.?!]/.test(last) ? text : `${text}.`;
}

/** Separador do bibtex: til quando o texto é curto (menos de 5 caracteres), espaço senão. */
const tieOrSpace = (text: string) => (text.length < 5 ? '~' : ' ');

/** "1-10" vira "1--10" (n.dashify). */
const dashify = (text: string) => text.replace(/(?<!-)-(?!-)/g, '--');

// ---------- Saída com o mesmo controle de pontuação do .bst (output, new.block, new.sentence)

type State = 'before' | 'mid' | 'sentence' | 'block';

class EntryWriter {
  private written = '';
  private pending = '';
  private state: State = 'before';

  get midSentence(): boolean {
    return this.state === 'mid';
  }

  output(text: string, dash = false): void {
    if (!text) return;
    if (this.state === 'mid') this.written += this.pending + (dash ? ' --- ' : ', ');
    else if (this.state === 'block') this.written += `${addPeriod(this.pending)}\n`;
    else if (this.state === 'sentence') this.written += `${addPeriod(this.pending)} `;
    else this.written += this.pending;
    this.state = 'mid';
    this.pending = text;
  }

  newBlock(): void {
    if (this.state !== 'before') this.state = 'block';
  }

  newSentence(): void {
    if (this.state !== 'block' && this.state !== 'before') this.state = 'sentence';
  }

  finish(): string {
    return this.written + addPeriod(this.pending);
  }
}

// ---------- Nomes

const lastWithJr = (person: Person) => [person.last, person.jr].filter(Boolean).join(' ');

/** "SOBRENOME, I.~N. von" (format.single.name). */
function referenceName(person: Person): string {
  const surname = changeCase(lastWithJr(person), 'upper');
  const first = person.first ? `, ${initials(person.first)}` : '';
  return `${surname}${first}${person.von ? ` ${person.von}` : ''}`;
}

/** Autores da referência: "A; B; C" ou "A et al." acima do limite (format.names). */
function referenceNames(list: Person[], options: AbntOptions): string {
  if (list.length === 0) return '';
  const tooMany = options.etalList > 0 && list.length > options.etalList;
  const named = tooMany ? list.slice(0, 1) : list.filter((person) => !isOthers(person));
  const etal = tooMany || isOthers(list.at(-1)!);
  return named.map(referenceName).join('; ') + (etal ? ' et al.' : '');
}

/** Nomes da citação: "Silva, Souza e Lima" (\citeonline) ou "SILVA; SOUZA; LIMA" (\cite). */
function citationNames(list: Person[], options: AbntOptions, upper: boolean): string {
  const names = list.map((person) => (isOthers(person) ? 'others' : lastWithJr(person)));
  const shown = upper ? names.map((name) => (name === 'others' ? name : changeCase(name, 'upper'))) : names;
  if (shown.length === 1) return shown[0]!;
  if (options.etalCite > 0 && shown.length > options.etalCite) return `${shown[0]} et al.`;
  const last = shown.at(-1)!;
  const head = shown.slice(0, -1).join(upper ? '; ' : ', ');
  if (last === 'others') return options.etalCite > 0 ? `${head} et al.` : head;
  return `${head}${upper ? '; ' : options.and}${last}`;
}

// ---------- Rótulos e ordenação

interface Labels {
  /** Para o \citeonline ("Silva e Souza"). */
  explicit: string;
  /** Para o \cite ("SILVA; SOUZA"). */
  implicit: string;
  /** "Silva e Souza 2020", no \bibitem[...] do modo alf. */
  simple: string;
}

function firstTitleWord(title: string): { label: string; whole: boolean } {
  const match = /^[^.:;, ]*/.exec(title)![0];
  return { label: match, whole: match === title };
}

function labelsOf(entry: BibEntry, options: AbntOptions): Labels {
  const field = (name: string) => entry.fields.get(name) ?? '';
  const year = field('year');
  const authors = people(field('author'));
  const editors = people(field('editor'));
  const organization = field('org-short') || field('organization');
  let explicit: string;
  let implicit: string;
  let simple: string;
  const names = authors.length > 0 ? authors : editors;
  if (names.length > 0) {
    explicit = citationNames(names, options, false);
    implicit = citationNames(names, options, true);
    simple = explicit;
  } else if (organization) {
    explicit = organization;
    implicit = changeCase(organization, 'upper');
    simple = field('organization') || organization;
  } else if (field('title')) {
    const { label, whole } = firstTitleWord(field('title'));
    explicit = whole ? label : `${label}\\ldots`;
    implicit = whole ? changeCase(label, 'upper') : `${changeCase(label, 'upper')}\\ldots`;
    simple = field('title');
  } else {
    explicit = 'nada';
    implicit = 'NADA';
    simple = '';
  }
  return { explicit, implicit, simple: year ? `${simple} ${year}` : simple };
}

function sortNames(list: Person[]): string {
  const shown = list.length > 3 ? [...list.slice(0, 3)] : list;
  const parts = shown.map((person) => sortify(referenceName(person)));
  return parts.join('   ') + (list.length > 3 ? '   zzzzz' : '');
}

function sortKeyOf(entry: BibEntry): string {
  const field = (name: string) => entry.fields.get(name) ?? '';
  const who = field('author')
    ? sortNames(people(field('author')))
    : field('organization')
      ? sortify(field('organization'))
      : field('editor')
        ? sortNames(people(field('editor')))
        : field('title')
          ? sortify(field('title'))
          : sortify(entry.key);
  const title = sortify(field('title').replace(/^(?:A|An|The)\s+/, ''));
  return `${who}    ${sortify(field('year'))}    ${title}`;
}

// ---------- Partes de uma referência

function formatter(entry: BibEntry, options: AbntOptions) {
  const field = (name: string) => entry.fields.get(name) ?? '';
  const has = (name: string) => field(name) !== '';
  const emphasize = (text: string) => (text ? `${options.emphasize}{${text}}` : '');
  const noAuthorship = !has('author') && !has('editor') && !has('organization');

  /** Primeira palavra em maiúsculas: título que faz as vezes de autor. */
  const titleAsAuthor = (title: string) => {
    const match = /^(\S+)(.*)$/s.exec(title);
    return match ? `${changeCase(match[1]!, 'upper')}${match[2]}` : title;
  };
  const subtitle = () => (has('subtitle') ? changeCase(`: ${field('subtitle')}`, 'title') : '');
  /** "p. 10--20" (format.pages). */
  const pages = () => {
    const value = field('pages');
    if (!value) return '';
    const shown = /[-,+]/.test(value) ? dashify(value) : value;
    return `${field('pagename') || 'p.'}${tieOrSpace(shown)}${shown}`;
  };

  return {
    field,
    has,
    authors: () => referenceNames(people(field('author')), options),
    editors: () => {
      const editors = people(field('editor'));
      return editors.length > 0 ? `${referenceNames(editors, options)} (${field('editortype') || 'Ed.'})` : '';
    },
    organization: () => changeCase(field('organization'), 'upper'),
    /** Título de parte (artigo, capítulo, trabalho em evento): só a primeira letra maiúscula. */
    title: () => {
      if (!has('title')) return '';
      return (noAuthorship ? titleAsAuthor(field('title')) : changeCase(field('title'), 'title')) + subtitle();
    },
    /** Título de obra (livro, manual, tese): em destaque, caixa como está no .bib. */
    bookTitle: () => {
      if (!has('title')) return '';
      return (noAuthorship ? titleAsAuthor(field('title')) : emphasize(field('title'))) + subtitle();
    },
    bookTitleOf: (name: 'booktitle') => {
      if (!has(name)) return '';
      return noAuthorship ? titleAsAuthor(field(name)) : emphasize(field(name));
    },
    journal: () => emphasize(field('journal')),
    edition: (writer: EntryWriter) => {
      const edition = field('edition');
      if (!edition) return '';
      const cased = writer.midSentence ? changeCase(edition, 'lower') : changeCase(edition, 'title');
      return /^\d/.test(edition) ? `${cased}. ed.` : cased;
    },
    volume: () => {
      const volume = field('volume');
      return volume && /^\d/.test(volume) ? `v.${tieOrSpace(volume)}${volume}` : volume;
    },
    number: () => {
      const number = field('number');
      return number ? `n.${tieOrSpace(number)}${number}` : '';
    },
    pages,
    bookPages: () => (has('pages') ? `${field('pages')}~p.` : ''),
    year: () => (has('year') ? dashify(field('year')) : ''),
    date: () => {
      const year = has('year') ? dashify(field('year')) : '';
      return has('month') && year ? `${field('month')} ${year}` : year || field('month');
    },
    /** "Local: Editora" com [S.l.] e [s.n.] quando faltam (format.field.address). */
    place: (publisher: string, relax = false) => {
      if (relax && !publisher && !has('address')) return '';
      if (!has('address') && !has('organization') && !has('url') && !publisher) return '[S.l.: s.n.]';
      const address = has('address') ? `${field('address')}: ` : has('url') ? '' : '[S.l.]: ';
      if (publisher) return `${address}${publisher}`;
      if (has('organization')) return address.replace(/: $/, '');
      return `${address}[s.n.]`;
    },
    address: () => field('address') || '[S.l.]',
    /** Primeira letra conforme a posição na frase (format.note, format.howpublished). */
    sentenceCase: (name: string, writer: EntryWriter) => {
      const text = field(name);
      if (!text) return '';
      if (text.startsWith('{')) return text;
      return changeCase(text.charAt(0), writer.midSentence ? 'lower' : 'upper') + text.slice(1);
    },
    series: () => {
      if (!has('series')) return '';
      if (!has('number') && !has('volume')) return ` (${field('series')})`;
      return ` (${field('series')}, ${field('number') || (has('volume') ? `v.${tieOrSpace(field('volume'))}${field('volume')}` : '')})`;
    },
    url: (writer: EntryWriter) => {
      if (has('url')) {
        writer.output(`Dispon{\\'\\i}vel em: \\url{${field('url').replace(/([%#_])/g, '\\$1')}}`);
        writer.newSentence();
      }
      if (has('urlaccessdate')) {
        writer.output(`Acesso em: ${field('urlaccessdate')}`);
        writer.newSentence();
      }
    },
    chapterPages: () => {
      if (!has('chapter')) return pages();
      const kind = has('type') ? changeCase(field('type'), 'lower') : 'cap.';
      const chapter = `${kind}${tieOrSpace(field('chapter'))}${field('chapter')}`;
      return has('pages') ? `${chapter}, ${pages()}` : chapter;
    },
  };
}

type Formatter = ReturnType<typeof formatter>;

/** "In: EDITOR (Ed.). \emph{Livro}" ou "In: \emph{Anais}" (format.in.ed.booktitle). */
function inBook(writer: EntryWriter, f: Formatter): void {
  if (f.has('editor')) {
    writer.output(`In: ${f.editors()}`);
    if (f.has('booktitle')) {
      writer.newSentence();
      writer.output(f.bookTitleOf('booktitle'));
    }
  } else if (f.has('organization') && f.has('author')) {
    writer.output(`In: ${f.organization()}`);
    if (f.has('booktitle')) {
      writer.newSentence();
      writer.output(f.bookTitleOf('booktitle'));
    }
  } else {
    writer.output(`In: ${f.bookTitleOf('booktitle')}`.trimEnd());
  }
  writer.newSentence();
}

function authorOrOrganization(writer: EntryWriter, f: Formatter, withEditor: boolean): void {
  if (f.has('author')) writer.output(f.authors());
  else if (withEditor && f.has('editor')) writer.output(f.editors());
  else if (f.has('organization')) writer.output(f.organization());
  writer.newSentence();
}

function formatBody(entry: BibEntry, options: AbntOptions): string {
  const f = formatter(entry, options);
  const w = new EntryWriter();
  const thesisKind: Record<string, string> = { phdthesis: 'Tese', mastersthesis: 'Disserta\\c{c}\\~{a}o', monography: 'Monografia' };
  switch (entry.type) {
    case 'article':
      authorOrOrganization(w, f, false);
      w.output(f.title());
      w.newBlock();
      w.output(f.journal());
      w.output(f.field('section'), true);
      w.output(f.field('publisher'));
      w.output(f.field('address'));
      w.output(f.volume());
      w.output(f.number());
      w.output(f.pages());
      w.output(f.date());
      w.output(f.has('issn') ? `ISSN ${f.field('issn')}` : '');
      w.newBlock();
      w.output(f.sentenceCase('note', w));
      w.newBlock();
      f.url(w);
      break;
    case 'book':
    case 'booklet':
    case 'proceedings':
      authorOrOrganization(w, f, true);
      w.output(f.field('type'));
      w.newSentence();
      w.output(f.bookTitle());
      w.newSentence();
      w.output(f.edition(w));
      w.newSentence();
      w.output(entry.type === 'booklet' ? f.field('address') : f.place(f.field('publisher')));
      w.output(f.year());
      w.newSentence();
      w.output(f.volume());
      w.newSentence();
      w.output(f.bookPages());
      w.newSentence();
      w.output(f.sentenceCase('howpublished', w));
      w.newSentence();
      w.output(f.series());
      w.newSentence();
      w.output(f.sentenceCase('note', w));
      w.output(f.has('isbn') ? `ISBN ${f.field('isbn')}` : '');
      w.newSentence();
      f.url(w);
      break;
    case 'inbook':
      authorOrOrganization(w, f, false);
      w.output(f.title());
      w.newBlock();
      inBook(w, f);
      w.output(f.edition(w));
      w.newSentence();
      w.output(f.place(f.field('publisher')));
      w.output(f.year());
      w.newSentence();
      w.output(f.has('series') ? '' : f.volume());
      w.output(f.series());
      w.output(f.chapterPages());
      w.newSentence();
      w.output(f.has('isbn') ? `ISBN ${f.field('isbn')}` : '');
      w.newBlock();
      w.output(f.sentenceCase('note', w));
      w.newBlock();
      f.url(w);
      break;
    case 'incollection':
      authorOrOrganization(w, f, false);
      w.output(f.title());
      w.newSentence();
      inBook(w, f);
      w.output(f.edition(w));
      w.newSentence();
      w.output(f.place(f.field('publisher')));
      w.output(f.year());
      w.output(f.series());
      w.newSentence();
      w.output(f.has('series') ? '' : f.volume());
      w.output(f.chapterPages());
      w.newSentence();
      w.output(f.has('isbn') ? `ISBN ${f.field('isbn')}` : '');
      w.newBlock();
      w.output(f.sentenceCase('note', w));
      w.newBlock();
      f.url(w);
      break;
    case 'inproceedings':
    case 'conference':
      authorOrOrganization(w, f, false);
      w.output(f.title());
      w.newSentence();
      inBook(w, f);
      w.output(f.place(f.field('publisher')));
      w.output(f.year());
      w.newSentence();
      w.output(f.has('series') ? '' : f.volume());
      w.output(f.series());
      w.output(f.pages());
      w.output(f.has('isbn') ? `ISBN ${f.field('isbn')}` : '');
      w.output(f.has('issn') ? `ISSN ${f.field('issn')}` : '');
      w.newSentence();
      w.output(f.sentenceCase('note', w));
      w.newSentence();
      f.url(w);
      break;
    case 'phdthesis':
    case 'mastersthesis':
    case 'monography':
      w.output(f.authors());
      w.newBlock();
      w.output(f.bookTitle());
      w.newBlock();
      w.output(f.has('year-presented') ? dashify(f.field('year-presented')) : '');
      w.newSentence();
      w.output(f.bookPages());
      w.newSentence();
      w.output(
        `${thesisKind[entry.type]}${f.has('type') ? ` (${f.field('type')})` : entry.type === 'phdthesis' ? ' (Doutorado)' : entry.type === 'mastersthesis' ? ' (Mestrado)' : ''}`,
      );
      w.output(f.field('school'), true);
      w.output(f.field('address'));
      w.output(f.date());
      w.newSentence();
      w.output(f.sentenceCase('note', w));
      w.newBlock();
      f.url(w);
      break;
    case 'manual':
    case 'techreport':
      authorOrOrganization(w, f, true);
      w.output(f.bookTitle());
      w.newBlock();
      w.output(f.edition(w));
      w.newSentence();
      w.output(f.address());
      w.output(f.year());
      w.newSentence();
      w.output(f.has('series') ? '' : f.volume());
      w.output(f.bookPages());
      w.newSentence();
      w.output(f.series());
      w.newSentence();
      w.output(f.sentenceCase('note', w));
      w.newSentence();
      f.url(w);
      break;
    default:
      // misc, online, unpublished e tipos desconhecidos.
      authorOrOrganization(w, f, true);
      w.output(f.field('type'));
      w.output(f.bookTitle());
      w.newSentence();
      w.output(f.place(f.field('publisher'), true));
      w.output(f.year());
      w.newSentence();
      w.output(f.bookPages());
      w.newSentence();
      w.output(f.sentenceCase('howpublished', w));
      w.newBlock();
      w.output(f.series());
      w.newSentence();
      w.output(f.sentenceCase('note', w));
      w.newBlock();
      f.url(w);
  }
  return w.finish();
}

/** Meses do .bib no formato da ABNT (as macros jan, feb... do .bst). */
export const ABNT_MONTHS: Record<string, string> = {
  jan: 'jan.', feb: 'fev.', mar: 'mar.', apr: 'abr.', may: 'maio', jun: 'jun.',
  jul: 'jul.', aug: 'ago.', sep: 'set.', oct: 'out.', nov: 'nov.', dec: 'dez.',
};

/** Corpo do .bbl no estilo ABNT para as entradas escolhidas (na ordem de citação). */
export function buildAbntBbl(chosen: readonly BibEntry[], options: AbntOptions): string {
  const items = chosen.map((entry) => ({ entry, labels: labelsOf(entry, options), sortKey: sortKeyOf(entry) }));
  // alf: ordem alfabética (autor, ano, título); num: ordem de citação (o SORT do .bst não muda nada).
  const ordered = options.alf ? [...items].sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0)) : items;

  // Mesmo autor e ano: 2020a, 2020b (forward.pass e reverse.pass).
  const yearOf = new Map<BibEntry, string>();
  for (let start = 0; start < ordered.length; ) {
    const key = (index: number) => `${ordered[index]!.labels.explicit}|${ordered[index]!.labels.implicit}|${ordered[index]!.entry.fields.get('year') ?? ''}`;
    let end = start + 1;
    while (end < ordered.length && key(end) === key(start)) end++;
    for (let index = start; index < end; index++) {
      const year = ordered[index]!.entry.fields.get('year') ?? '';
      yearOf.set(ordered[index]!.entry, end - start > 1 ? `${year}${String.fromCharCode(97 + index - start)}` : year);
    }
    start = end;
  }

  const lines = [
    '% Gerado pelo OverDocTeX (BibTeX no navegador, estilo ABNT do abnTeX2)',
    `${options.alf ? '\\setlength{\\labelsep}{0pt}' : ''}\\begin{thebibliography}{}`,
    '\\providecommand{\\abntrefinfo}[3]{}',
    // O .bst conta com o \\url do pacote url (o hyperref carrega); sem ele, texto simples.
    '\\providecommand{\\url}[1]{\\texttt{#1}}',
    '\\providecommand{\\abntbstabout}[1]{}',
    '\\abntbstabout{v-1.9.7 }',
  ];
  for (const { entry, labels } of ordered) {
    lines.push('');
    lines.push(options.alf ? `\\bibitem[${labels.simple}]{${entry.key}}` : `\\bibitem{${entry.key}}`);
    lines.push(`\\abntrefinfo{${labels.explicit}}{${labels.implicit}}{${yearOf.get(entry) ?? ''}}`);
    lines.push(`{${formatBody(entry, options)}}`);
  }
  lines.push('', '\\end{thebibliography}', '');
  return lines.join('\n');
}
