/**
 * Configuração do biblatex que o Biber receberia no .bcf, lida das fontes:
 * opções (padrões, estilo, \usepackage e \ExecuteBibliographyOptions),
 * modelos de ordenação, de labelname, labeltitle, labeldate e labelalpha,
 * mapas de campos (\DeclareSourcemap) e campos novos do modelo de dados.
 *
 * Os padrões vêm do biblatex.def do biblatex 3.21 (TeX Live 2025, LPPL),
 * lidos pelo mesmo leitor que lê os estilos (.bbx, .cbx, .dbx) e o preâmbulo.
 */
import { stripComments } from '@/lib/diff/latex-diff';

export type UniquenameMode = 'false' | 'init' | 'full' | 'allinit' | 'allfull' | 'mininit' | 'minfull';
export type UniquelistMode = 'false' | 'true' | 'minyear';

export interface BiblatexOptions {
  sorting: string;
  maxcitenames: number;
  mincitenames: number;
  maxbibnames: number;
  minbibnames: number;
  maxsortnames: number;
  minsortnames: number;
  maxalphanames: number;
  minalphanames: number;
  uniquename: UniquenameMode;
  uniquelist: UniquelistMode;
  labelalpha: boolean;
  labeldateparts: boolean;
  singletitle: boolean;
  uniquetitle: boolean;
  uniquebaretitle: boolean;
  uniquework: boolean;
  uniqueprimaryauthor: boolean;
  useprefix: boolean;
  /** use<campo> (useauthor, useeditor, usetranslator...): falso tira o campo de labelname e da ordenação. */
  use: Record<string, boolean>;
  mincrossrefs: number;
  minxrefs: number;
  sortcase: boolean;
  sortupper: boolean;
  alphaothers: string;
  sortalphaothers: string;
  nohashothers: boolean;
  nosortothers: boolean;
  language: string;
}

export interface SortElement {
  kind: 'field' | 'literal' | 'citeorder' | 'intciteorder' | 'citecount';
  /** Nome do campo ou texto do \literal. */
  value: string;
  options: Record<string, string>;
}

export interface SortSpec {
  final: boolean;
  descending: boolean;
  elements: SortElement[];
}

export interface LabelalphaField {
  field: string;
  options: Record<string, string>;
}

/** Passo de um \map do \DeclareSourcemap (só os tipos de passo mais usados). */
export interface SourcemapStep {
  typesource?: string;
  typetarget?: string;
  fieldsource?: string;
  fieldtarget?: string;
  fieldset?: string;
  fieldvalue?: string;
  match?: string;
  notmatch?: string;
  replace?: string;
  null?: boolean;
  origfieldval?: boolean;
  final?: boolean;
  append?: boolean;
  overwrite?: boolean;
}

export interface SourcemapRule {
  overwrite: boolean;
  pertype: string[];
  pernottype: string[];
  steps: SourcemapStep[];
}

export interface DatamodelAdditions {
  names: string[];
  lists: string[];
  fields: string[];
  verbatim: string[];
  dates: string[];
  ranges: string[];
}

/** Contexto de referência (refcontext): cada combinação distinta vira uma lista ordenada no .bbl. */
export interface RefcontextSpec {
  sorting?: string;
  sortingnamekeytemplatename?: string;
  labelprefix?: string;
  uniquenametemplatename?: string;
  labelalphanametemplatename?: string;
  namehashtemplatename?: string;
}

/** Modelo da chave de ordenação de um nome (\DeclareSortingNamekeyTemplate). */
export interface SortingNamekeyTemplate {
  /** Que limite de nomes vale: o da ordenação (padrão), o das citações ou o da bibliografia. */
  visibility: 'sort' | 'cite' | 'bib';
  keyparts: { part: string; use: boolean | null; inits: boolean }[][];
}

export interface BiblatexConfig {
  options: BiblatexOptions;
  sortingTemplates: Map<string, SortSpec[]>;
  sortingNamekeyTemplates: Map<string, SortingNamekeyTemplate>;
  /** Contextos pedidos pelo estilo ou pelo preâmbulo (\GenRefcontextData, \DeclareRefcontext...). */
  refcontexts: RefcontextSpec[];
  labelname: string[];
  labeltitle: string[];
  labeldate: string[];
  labelalpha: LabelalphaField[][];
  presort: string;
  sourcemaps: SourcemapRule[];
  datamodel: DatamodelAdditions;
}

/** Trechos do biblatex.def (3.21) com os padrões que o Biber usa. */
const BIBLATEX_DEFAULTS = String.raw`
\DeclareDriverSourcemap[datatype=bibtex]{
  \map{\step[fieldset=day, null]}
  \map{
    \step[typesource=conference, typetarget=inproceedings]
    \step[typesource=electronic, typetarget=online]
    \step[typesource=www,        typetarget=online]
  }
  \map{
    \step[typesource=mastersthesis, typetarget=thesis, final]
    \step[fieldset=type,            fieldvalue=mathesis]
  }
  \map{
    \step[typesource=phdthesis, typetarget=thesis, final]
    \step[fieldset=type,        fieldvalue=phdthesis]
  }
  \map{
    \step[typesource=techreport, typetarget=report, final]
    \step[fieldset=type,         fieldvalue=techreport]
  }
  \map{
    \step[fieldsource=hyphenation,   fieldtarget=langid]
    \step[fieldsource=address,       fieldtarget=location]
    \step[fieldsource=school,        fieldtarget=institution]
    \step[fieldsource=annote,        fieldtarget=annotation]
    \step[fieldsource=archiveprefix, fieldtarget=eprinttype]
    \step[fieldsource=journal,       fieldtarget=journaltitle]
    \step[fieldsource=primaryclass,  fieldtarget=eprintclass]
    \step[fieldsource=key,           fieldtarget=sortkey]
    \step[fieldsource=pdf,           fieldtarget=file]
  }
}
\DeclareLabelname{\field{shortauthor}\field{author}\field{shorteditor}\field{editor}\field{translator}}
\DeclareLabeldate{\field{date}\field{year}\field{eventdate}\field{origdate}\field{urldate}\literal{nodate}}
\DeclareLabeltitle{\field{shorttitle}\field{title}\field{maintitle}}
\DeclareLabelalphaTemplate{
  \labelelement{
    \field[final]{shorthand}
    \field{label}
    \field[strwidth=3,strside=left,ifnames=1]{labelname}
    \field[strwidth=1,strside=left]{labelname}
  }
  \labelelement{\field[strwidth=2,strside=right]{year}}
}
\DeclareSortingNamekeyTemplate{
  \keypart{\namepart[use=true]{prefix}\namepart{family}}
  \keypart{\namepart{given}}
  \keypart{\namepart{suffix}}
  \keypart{\namepart[use=false]{prefix}}
}
\DeclarePresort{mm}
\DeclareSortingTemplate{shorthand}{\sort[final]{\field{sortshorthand}}\sort{\field{shorthand}}}
\DeclareSortingTemplate{none}{\sort{\citeorder}\sort{\intciteorder}}
\DeclareSortingTemplate{count}{\sort[direction=descending]{\citecount}}
\DeclareSortingTemplate{debug}{\sort{\field{entrykey}}}
\DeclareSortingTemplate{nty}{
  \sort{\field{presort}}\sort[final]{\field{sortkey}}
  \sort{\field{sortname}\field{author}\field{editor}\field{translator}\field{sorttitle}\field{title}}
  \sort{\field{sorttitle}\field{title}}\sort{\field{sortyear}\field{year}}\sort{\field{volume}\literal{0}}
}
\DeclareSortingTemplate{nyt}{
  \sort{\field{presort}}\sort[final]{\field{sortkey}}
  \sort{\field{sortname}\field{author}\field{editor}\field{translator}\field{sorttitle}\field{title}}
  \sort{\field{sortyear}\field{year}}\sort{\field{sorttitle}\field{title}}\sort{\field{volume}\literal{0}}
}
\DeclareSortingTemplate{nyvt}{
  \sort{\field{presort}}\sort[final]{\field{sortkey}}
  \sort{\field{sortname}\field{author}\field{editor}\field{translator}\field{sorttitle}\field{title}}
  \sort{\field{sortyear}\field{year}}\sort{\field{volume}\literal{0}}\sort{\field{sorttitle}\field{title}}
}
\DeclareSortingTemplate{anyt}{
  \sort{\field{presort}}\sort{\field{labelalpha}}\sort[final]{\field{sortkey}}
  \sort{\field{sortname}\field{author}\field{editor}\field{translator}\field{sorttitle}\field{title}}
  \sort{\field{sortyear}\field{year}}\sort{\field{sorttitle}\field{title}}\sort{\field{volume}\literal{0}}
}
\DeclareSortingTemplate{anyvt}{
  \sort{\field{presort}}\sort{\field{labelalpha}}\sort[final]{\field{sortkey}}
  \sort{\field{sortname}\field{author}\field{editor}\field{translator}\field{sorttitle}\field{title}}
  \sort{\field{sortyear}\field{year}}\sort{\field{volume}\literal{0}}\sort{\field{sorttitle}\field{title}}
}
\DeclareSortingTemplate{ynt}{
  \sort{\field{presort}}\sort[final]{\field{sortkey}}\sort{\field{sortyear}\field{year}\literal{9999}}
  \sort{\field{sortname}\field{author}\field{editor}\field{translator}\field{sorttitle}\field{title}}
  \sort{\field{sorttitle}\field{title}}
}
\DeclareSortingTemplate{ydnt}{
  \sort{\field{presort}}\sort[final]{\field{sortkey}}\sort[direction=descending]{\field{sortyear}\field{year}\literal{9999}}
  \sort{\field{sortname}\field{author}\field{editor}\field{translator}\field{sorttitle}\field{title}}
  \sort{\field{sorttitle}\field{title}}
}
\DeclareSortingTemplate{ntd}{
  \sort{\field{presort}}\sort[final]{\field{sortkey}}
  \sort{\field{sortname}\field{author}\field{editor}\field{translator}\field{sorttitle}\field{title}}
  \sort{\field{sorttitle}\field{title}}\sort{\field{sortyear}\field{year}}\sort{\field{month}}\sort{\field{day}}
  \sort{\field{volume}\literal{0}}
}
\DeclareSortingTemplate{ndt}{
  \sort{\field{presort}}\sort[final]{\field{sortkey}}
  \sort{\field{sortname}\field{author}\field{editor}\field{translator}\field{sorttitle}\field{title}}
  \sort{\field{sortyear}\field{year}}\sort{\field{month}}\sort{\field{day}}\sort{\field{sorttitle}\field{title}}
  \sort{\field{volume}\literal{0}}
}
\DeclareSortingTemplate{dnt}{
  \sort{\field{presort}}\sort[final]{\field{sortkey}}\sort{\field{sortyear}\field{year}\literal{9999}}
  \sort{\field{month}}\sort{\field{day}}
  \sort{\field{sortname}\field{author}\field{editor}\field{translator}\field{sorttitle}\field{title}}
  \sort{\field{sorttitle}\field{title}}
}
\DeclareSortingTemplate{ddnt}{
  \sort{\field{presort}}\sort[final]{\field{sortkey}}
  \sort[direction=descending]{\field{sortyear}\field{year}\literal{9999}}
  \sort[direction=descending]{\field{month}}\sort[direction=descending]{\field{day}}
  \sort{\field{sortname}\field{author}\field{editor}\field{translator}\field{sorttitle}\field{title}}
  \sort{\field{sorttitle}\field{title}}
}
`;

const DEFAULT_OPTIONS: BiblatexOptions = {
  sorting: 'nty',
  maxcitenames: 3,
  mincitenames: 1,
  maxbibnames: 3,
  minbibnames: 1,
  maxsortnames: 3,
  minsortnames: 1,
  maxalphanames: 3,
  minalphanames: 1,
  uniquename: 'false',
  uniquelist: 'false',
  labelalpha: false,
  labeldateparts: false,
  singletitle: false,
  uniquetitle: false,
  uniquebaretitle: false,
  uniquework: false,
  uniqueprimaryauthor: false,
  useprefix: false,
  use: { translator: false },
  mincrossrefs: 2,
  minxrefs: 2,
  sortcase: true,
  sortupper: true,
  alphaothers: '+',
  sortalphaothers: '+',
  nohashothers: false,
  nosortothers: false,
  language: '',
};

// ---------- Leitura de comandos com argumentos ----------

/** Fim (exclusivo) do grupo que abre em `start` com `open`; -1 se não fecha. */
function groupEnd(text: string, start: number, open: string, close: string): number {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (char === '\\') {
      i++;
      continue;
    }
    if (char === open) depth++;
    else if (char === close && --depth === 0) return i + 1;
  }
  return -1;
}

interface Call {
  optional: string | null;
  args: string[];
  end: number;
}

/** Argumentos de `\name` a partir de `from`: um opcional (se `optional`) e `count` obrigatórios. */
function readCall(text: string, from: number, count: number, optional = true): Call | null {
  let i = from;
  const skip = () => {
    while (i < text.length && /\s/.test(text[i]!)) i++;
  };
  skip();
  let opt: string | null = null;
  if (optional && text[i] === '[') {
    const end = groupEnd(text, i, '[', ']');
    if (end < 0) return null;
    opt = text.slice(i + 1, end - 1);
    i = end;
    skip();
  }
  const args: string[] = [];
  for (let n = 0; n < count; n++) {
    skip();
    if (text[i] !== '{') {
      // Argumento de um token só (\RequireBibliographyStyle standard não existe; mas \field x sim, raro).
      return null;
    }
    const end = groupEnd(text, i, '{', '}');
    if (end < 0) return null;
    args.push(text.slice(i + 1, end - 1));
    i = end;
  }
  return { optional: opt, args, end: i };
}

/** Todas as chamadas de `\name` no texto (sem confundir com \nameOutra). */
function calls(text: string, name: string, count: number, optional = true): Call[] {
  const found: Call[] = [];
  const re = new RegExp(String.raw`\\${name}(?![a-zA-Z@])`, 'g');
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const call = readCall(text, match.index + match[0].length, count, optional);
    if (call) {
      found.push(call);
      re.lastIndex = call.end;
    }
  }
  return found;
}

/** "a=1, b, c={x,y}" em pares (sem valor vira 'true'); vírgulas dentro de chaves não separam. */
export function keyValues(text: string): [string, string][] {
  const pairs: [string, string][] = [];
  let depth = 0;
  let current = '';
  const flush = () => {
    const item = current.trim();
    current = '';
    if (!item) return;
    const eq = item.indexOf('=');
    const key = (eq < 0 ? item : item.slice(0, eq)).trim();
    let value = eq < 0 ? 'true' : item.slice(eq + 1).trim();
    if (value.startsWith('{') && value.endsWith('}')) value = value.slice(1, -1).trim();
    if (key) pairs.push([key.toLowerCase(), value]);
  };
  for (const char of text) {
    if (char === '{') depth++;
    else if (char === '}') depth--;
    if (char === ',' && depth === 0) flush();
    else current += char;
  }
  flush();
  return pairs;
}

const asBool = (value: string) => value.toLowerCase() !== 'false';
const asInt = (value: string, fallback: number) => {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? number : fallback;
};

const UNIQUENAME: Record<string, UniquenameMode> = {
  true: 'full', false: 'false', init: 'init', full: 'full', allinit: 'allinit', allfull: 'allfull', mininit: 'mininit', minfull: 'minfull',
};

/** Aplica uma opção do biblatex (com os efeitos em cadeia de maxnames, maxbibnames...). */
export function applyOption(options: BiblatexOptions, key: string, value: string): void {
  switch (key) {
    case 'sorting':
      options.sorting = value;
      break;
    case 'maxnames':
      options.maxcitenames = options.maxbibnames = options.maxsortnames = asInt(value, options.maxcitenames);
      break;
    case 'minnames':
      options.mincitenames = options.minbibnames = options.minsortnames = asInt(value, options.mincitenames);
      break;
    case 'maxbibnames':
      options.maxbibnames = options.maxsortnames = asInt(value, options.maxbibnames);
      break;
    case 'minbibnames':
      options.minbibnames = options.minsortnames = asInt(value, options.minbibnames);
      break;
    case 'maxcitenames':
    case 'mincitenames':
    case 'maxsortnames':
    case 'minsortnames':
    case 'maxalphanames':
    case 'minalphanames':
    case 'mincrossrefs':
    case 'minxrefs':
      options[key] = asInt(value, options[key]);
      break;
    case 'uniquename':
      options.uniquename = UNIQUENAME[value.toLowerCase()] ?? options.uniquename;
      break;
    case 'uniquelist':
      options.uniquelist = value === 'minyear' ? 'minyear' : asBool(value) ? 'true' : 'false';
      break;
    case 'labelalpha':
    case 'singletitle':
    case 'uniquetitle':
    case 'uniquebaretitle':
    case 'uniquework':
    case 'uniqueprimaryauthor':
    case 'useprefix':
    case 'sortcase':
    case 'sortupper':
    case 'nohashothers':
    case 'nosortothers':
      options[key] = asBool(value);
      break;
    case 'labeldateparts':
    case 'labelyear':
      options.labeldateparts = asBool(value);
      break;
    case 'alphaothers':
    case 'sortalphaothers':
      options[key] = value;
      break;
    case 'language':
      options.language = value;
      break;
    default:
      if (/^use[a-z]+$/.test(key) && key !== 'useprefix') options.use[key.slice(3)] = asBool(value);
  }
}

/** Dentro de \DeclareSortingTemplate{nome}{...}: os \sort[opções]{elementos}. */
function parseSortSpecs(body: string): SortSpec[] {
  return calls(body, 'sort', 1).map((call) => {
    const options = Object.fromEntries(keyValues(call.optional ?? ''));
    const elements: SortElement[] = [];
    const re = /\\(field|literal|citeorder|intciteorder|citecount)(?![a-zA-Z])/g;
    let match: RegExpExecArray | null;
    const inner = call.args[0]!;
    while ((match = re.exec(inner)) !== null) {
      const kind = match[1] as SortElement['kind'];
      if (kind === 'field' || kind === 'literal') {
        const arg = readCall(inner, re.lastIndex, 1);
        if (!arg) continue;
        elements.push({ kind, value: arg.args[0]!.trim(), options: Object.fromEntries(keyValues(arg.optional ?? '')) });
        re.lastIndex = arg.end;
      } else elements.push({ kind, value: '', options: {} });
    }
    return { final: options.final !== undefined && options.final !== 'false', descending: options.direction === 'descending', elements };
  });
}

const fieldsOf = (body: string) =>
  [...body.matchAll(/\\(field|literal)\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/g)].map((match) => (match[1] === 'literal' ? `literal:${match[2]!.trim()}` : match[2]!.trim()));

/** \DeclareSourcemap{\maps[...]{\map{...}}}; o \DeclareDriverSourcemap[datatype=...]{\map{...}} vem sem o \maps. */
function parseSourcemap(body: string, outerOptions: string | null = null): SourcemapRule[] {
  const rules: SourcemapRule[] = [];
  const groups = /\\maps(?![a-zA-Z])/.test(body) ? calls(body, 'maps', 1) : [{ optional: outerOptions, args: [body], end: 0 }];
  for (const maps of groups) {
    const mapsOptions = Object.fromEntries(keyValues(maps.optional ?? ''));
    if (mapsOptions.datatype && mapsOptions.datatype !== 'bibtex' && mapsOptions.datatype !== 'biblatexml') continue;
    const mapsOverwrite = mapsOptions.overwrite !== undefined && mapsOptions.overwrite !== 'false';
    for (const map of calls(maps.args[0]!, 'map', 1)) {
      const mapOptions = Object.fromEntries(keyValues(map.optional ?? ''));
      const inner = map.args[0]!;
      rules.push({
        overwrite: mapOptions.overwrite !== undefined ? mapOptions.overwrite !== 'false' : mapsOverwrite,
        pertype: calls(inner, 'pertype', 1, false).map((call) => call.args[0]!.trim().toLowerCase()),
        pernottype: calls(inner, 'pernottype', 1, false).map((call) => call.args[0]!.trim().toLowerCase()),
        steps: [...inner.matchAll(/\\step\s*\[/g)].flatMap((match) => {
          const start = match.index! + match[0].length - 1;
          const end = groupEnd(inner, start, '[', ']');
          if (end < 0) return [];
          const step: SourcemapStep = {};
          for (const [key, value] of keyValues(inner.slice(start + 1, end - 1))) {
            if (key === 'null' || key === 'origfieldval' || key === 'final' || key === 'append' || key === 'overwrite') step[key] = value !== 'false';
            else if (key === 'match' || key === 'notmatch') step[key] = unwrapRegexp(value);
            else if (key === 'replace') step.replace = unwrapRegexp(value);
            else if (['typesource', 'typetarget', 'fieldsource', 'fieldtarget', 'fieldset', 'fieldvalue'].includes(key)) {
              (step as Record<string, string>)[key] = key.startsWith('type') || key.startsWith('field') && key !== 'fieldvalue' ? value.toLowerCase() : value;
            }
          }
          return [step];
        }),
      });
    }
  }
  return rules;
}

/** \regexp{...} (ou o valor entre chaves) dos mapas: o texto da expressão. */
function unwrapRegexp(value: string): string {
  const match = /^\\regexp\s*\{([\s\S]*)\}$/.exec(value.trim());
  return match ? match[1]! : value;
}

const REFCONTEXT_KEYS = ['sorting', 'sortingnamekeytemplatename', 'labelprefix', 'uniquenametemplatename', 'labelalphanametemplatename', 'namehashtemplatename'] as const;

/** Contextos de referência pedidos num texto: \newrefcontext[...], \begin{refcontext}[...], \printbibliography[...]... */
export function refcontextsIn(text: string): RefcontextSpec[] {
  const found: RefcontextSpec[] = [];
  const pattern =
    /\\(?:newrefcontext|localrefcontext|printbibliography|printbiblist|bibbysection|bibbysegment|bibbycategory)\s*\[([^\]]*)\]|\\begin\s*\{refcontext\}\s*\[([^\]]*)\]|\\GenRefcontextData\s*\{([^}]*)\}|\\DeclareRefcontext\s*\{[^}]*\}\s*\{([^}]*)\}/g;
  for (const match of text.matchAll(pattern)) {
    const spec: RefcontextSpec = {};
    for (const [key, value] of keyValues(match[1] ?? match[2] ?? match[3] ?? match[4] ?? '')) {
      // Os nomes curtos (sortingnamekeytemplate=) também valem no biblatex.
      const full = REFCONTEXT_KEYS.find((name) => name === key || name === `${key}name`);
      if (full) spec[full] = value;
    }
    if (Object.keys(spec).length > 0) found.push(spec);
  }
  return found;
}

function parseNamekeyTemplate(body: string): SortingNamekeyTemplate {
  const visibility = /\\visibility\s*\{\s*(cite|bib|sort)\s*\}/.exec(body)?.[1] as SortingNamekeyTemplate['visibility'] | undefined;
  return {
    visibility: visibility ?? 'sort',
    keyparts: calls(body, 'keypart', 1, false).map((keypart) =>
      calls(keypart.args[0]!, 'namepart', 1).map((part) => {
        const options = Object.fromEntries(keyValues(part.optional ?? ''));
        return { part: part.args[0]!.trim(), use: options.use === undefined ? null : options.use !== 'false', inits: options.inits !== undefined && options.inits !== 'false' };
      }),
    ),
  };
}

function parseDatamodel(text: string, into: DatamodelAdditions): void {
  for (const call of calls(text, 'DeclareDatamodelFields', 1)) {
    const options = Object.fromEntries(keyValues(call.optional ?? ''));
    const names = call.args[0]!.split(',').map((name) => name.trim().toLowerCase()).filter(Boolean);
    const target =
      options.type === 'list'
        ? options.datatype === 'name'
          ? into.names
          : into.lists
        : options.datatype === 'verbatim' || options.datatype === 'uri'
          ? into.verbatim
          : options.datatype === 'date'
            ? into.dates
            : options.datatype === 'range'
              ? into.ranges
              : into.fields;
    target.push(...names);
  }
}

/** Estilos pedidos por um .bbx ou .cbx (\RequireBibliographyStyle, \RequireCitationStyle). */
function requiredStyles(text: string, kind: 'bbx' | 'cbx'): string[] {
  const command = kind === 'bbx' ? 'RequireBibliographyStyle' : 'RequireCitationStyle';
  return calls(text, command, 1).map((call) => call.args[0]!.trim());
}

export interface BiblatexSources {
  /** Opções do \usepackage[...]{biblatex}. */
  packageOptions: string;
  /** Preâmbulo do documento (sem comentários): \ExecuteBibliographyOptions, \DeclareSourcemap... */
  preamble: string;
  /** Conteúdo de um arquivo de estilo (.bbx, .cbx, .dbx) pelo nome; nulo se não houver. */
  styleFile: (name: string) => string | null;
}

/** Estilo de bibliografia e de citação pedidos nas opções do pacote (style= vale para os dois). */
export function stylesFromOptions(packageOptions: string): { bibstyle: string; citestyle: string; datamodels: string[] } {
  // Sem nada, o biblatex usa numeric; style= vale para os dois, salvo bibstyle= ou citestyle= próprios.
  let style = 'numeric';
  let bibstyle: string | null = null;
  let citestyle: string | null = null;
  const datamodels: string[] = [];
  for (const [key, value] of keyValues(stripComments(packageOptions))) {
    if (key === 'style') style = value;
    else if (key === 'bibstyle') bibstyle = value;
    else if (key === 'citestyle') citestyle = value;
    else if (key === 'datamodel') datamodels.push(value);
  }
  return { bibstyle: bibstyle ?? style, citestyle: citestyle ?? style, datamodels };
}

/** Monta a configuração que o biblatex mandaria ao Biber. */
export function readBiblatexConfig({ packageOptions, preamble, styleFile }: BiblatexSources): BiblatexConfig {
  const config: BiblatexConfig = {
    options: { ...DEFAULT_OPTIONS, use: { ...DEFAULT_OPTIONS.use } },
    sortingTemplates: new Map(),
    sortingNamekeyTemplates: new Map(),
    refcontexts: [],
    labelname: [],
    labeltitle: [],
    labeldate: [],
    labelalpha: [],
    presort: 'mm',
    sourcemaps: [],
    datamodel: { names: [], lists: [], fields: [], verbatim: [], dates: [], ranges: [] },
  };
  const { bibstyle, citestyle, datamodels } = stylesFromOptions(packageOptions);

  // Textos na ordem em que o biblatex os lê: padrões, modelo de dados, estilo de bibliografia (com os
  // que ele pede antes), estilo de citação e, por último, o preâmbulo.
  const texts: string[] = [BIBLATEX_DEFAULTS];
  for (const name of datamodels) {
    const text = styleFile(`${name}.dbx`);
    if (text) texts.push(stripComments(text));
  }
  const visit = (name: string, kind: 'bbx' | 'cbx', seen: Set<string>) => {
    if (seen.has(name)) return;
    seen.add(name);
    const raw = styleFile(`${name}.${kind}`);
    if (!raw) return;
    const text = stripComments(raw);
    for (const required of requiredStyles(text, kind)) visit(required, kind, seen);
    texts.push(text);
  };
  visit(bibstyle, 'bbx', new Set());
  visit(citestyle, 'cbx', new Set());

  const driverMaps: SourcemapRule[] = [];
  const styleMaps: SourcemapRule[] = [];
  const userMaps: SourcemapRule[] = [];
  const readDeclarations = (text: string, isPreamble: boolean) => {
    parseDatamodel(text, config.datamodel);
    for (const call of calls(text, 'ExecuteBibliographyOptions', 1)) {
      // Opções por tipo ([online]{url=true}) não mudam o .bbl.
      if (call.optional) continue;
      for (const [key, value] of keyValues(call.args[0]!)) applyOption(config.options, key, value);
    }
    for (const call of calls(text, 'DeclareSortingTemplate', 2)) config.sortingTemplates.set(call.args[0]!.trim(), parseSortSpecs(call.args[1]!));
    // Versões por tipo de entrada ([book]) ficam de fora: valem só para alguns tipos.
    for (const call of calls(text, 'DeclareLabelname', 1)) if (!call.optional) config.labelname = fieldsOf(call.args[0]!);
    for (const call of calls(text, 'DeclareLabeltitle', 1)) if (!call.optional) config.labeltitle = fieldsOf(call.args[0]!);
    for (const call of calls(text, 'DeclareLabeldate', 1)) if (!call.optional) config.labeldate = fieldsOf(call.args[0]!);
    for (const call of calls(text, 'DeclareLabelalphaTemplate', 1)) {
      if (call.optional) continue;
      config.labelalpha = calls(call.args[0]!, 'labelelement', 1, false).map((element) =>
        calls(element.args[0]!, 'field', 1).map((field) => ({ field: field.args[0]!.trim(), options: Object.fromEntries(keyValues(field.optional ?? '')) })),
      );
    }
    for (const call of calls(text, 'DeclarePresort', 1)) if (!call.optional) config.presort = call.args[0]!.trim();
    for (const call of calls(text, 'DeclareSortingNamekeyTemplate', 1)) config.sortingNamekeyTemplates.set(call.optional?.trim() || 'global', parseNamekeyTemplate(call.args[0]!));
    config.refcontexts.push(...refcontextsIn(text));
    for (const call of calls(text, 'DeclareDriverSourcemap', 1)) driverMaps.push(...parseSourcemap(call.args[0]!, call.optional));
    for (const call of calls(text, 'DeclareStyleSourcemap', 1)) styleMaps.push(...parseSourcemap(call.args[0]!));
    for (const call of calls(text, 'DeclareSourcemap', 1)) (isPreamble ? userMaps : styleMaps).push(...parseSourcemap(call.args[0]!));
  };
  for (const text of texts) readDeclarations(text, false);
  // As opções do pacote valem sobre as dos estilos; o preâmbulo vem depois de carregar o pacote.
  for (const [key, value] of keyValues(stripComments(packageOptions))) applyOption(config.options, key, value);
  readDeclarations(preamble, true);
  // Mapas do usuário primeiro, depois os do estilo e por último os do driver (como o Biber).
  config.sourcemaps = [...userMaps, ...styleMaps, ...driverMaps];
  // Mínimos acima dos máximos são corrigidos pelo biblatex.
  const options = config.options;
  for (const kind of ['cite', 'bib', 'sort', 'alpha'] as const) {
    const max = `max${kind}names` as const;
    const min = `min${kind}names` as const;
    if (options[min] > options[max]) options[min] = options[max];
  }
  return config;
}
