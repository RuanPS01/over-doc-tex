/**
 * Preparação do projeto para o compilador (puro, sem I/O): qual arquivo é o
 * principal, quais arquivos vão junto (inclusive o .bbl gerado) e como ler os
 * erros do log do TeX.
 */
import { t } from '@/lib/i18n';
import { stylesFromOptions } from './biblatex-config';
import { buildBbl } from './bibliography';
import { buildBiblatexBbl, scanBiblatex, type BiblatexBblResult } from './bibliography-biblatex';

export interface ProjectTextFile {
  path: string;
  content: string;
}

/** Remove comentários de linha (% não escapado) para não achar \documentclass comentado. */
function stripComments(source: string): string {
  return source.replace(/(^|[^\\])%.*$/gm, '$1');
}

export function hasDocumentClass(source: string): boolean {
  return /\\documentclass\s*(\[[^\]]*\])?\s*\{/.test(stripComments(source));
}

/**
 * Arquivo principal: o preferido (ex.: o aberto no editor) se tiver
 * \documentclass; senão o main.tex da raiz; senão o .tex com \documentclass
 * de caminho mais curto.
 */
export function pickMainFile(files: readonly ProjectTextFile[], preferredPath?: string | null): string | null {
  const candidates = files.filter((file) => file.path.endsWith('.tex') && hasDocumentClass(file.content));
  const preferred = candidates.find((file) => file.path === preferredPath);
  if (preferred) return preferred.path;
  const root = candidates.find((file) => file.path === 'main.tex');
  if (root) return root.path;
  const [shortest] = [...candidates].sort((a, b) => a.path.split('/').length - b.path.split('/').length || a.path.localeCompare(b.path));
  return shortest?.path ?? null;
}

/** Idiomas cujo .ldf não vem nos conjuntos do Siglum: carregados pelos arquivos de localidade do babel. */
const BABEL_ALIASES: Record<string, string> = {
  brazil: 'brazilian',
  brazilian: 'brazilian',
  portuges: 'portuguese',
  portuguese: 'portuguese',
};

/**
 * Os conjuntos do Siglum não trazem o babel-portuges (brazil.ldf). Só na
 * compilação, o \usepackage{babel} do próprio documento troca os nomes antigos
 * pelos de localidade e ganha provide=*, que carrega o idioma pelos arquivos
 * .ini (funciona até sem o repositório do site). O babel carregado por uma
 * classe, como o abnTeX2, não passa por aqui: recebe o .ldf de
 * babelLanguagePackages. O .tex do usuário não muda.
 */
export function adaptBabel(source: string): string {
  return source.replace(/\\usepackage\s*\[([^\]]*)\]\s*\{babel\}/g, (match, rawOptions: string) => {
    const options = rawOptions.split(',').map((option) => option.trim()).filter(Boolean);
    if (!options.some((option) => option in BABEL_ALIASES)) return match;
    const adapted = options.map((option) => BABEL_ALIASES[option] ?? option);
    if (!adapted.some((option) => option.startsWith('provide'))) adapted.unshift('provide=*');
    return `\\usepackage[${[...new Set(adapted)].join(',')}]{babel}`;
  });
}

/** Idiomas do babel cujo .ldf não vem no compilador, com o pacote do TeX Live que o traz (public/texlive). */
const BABEL_LANGUAGE_PACKAGES: Record<string, string> = {
  brazil: 'babel-portuges',
  brazilian: 'babel-portuges',
  portuges: 'babel-portuges',
  portuguese: 'babel-portuges',
  french: 'babel-french',
  francais: 'babel-french',
  acadian: 'babel-french',
  spanish: 'babel-spanish',
  spanishmx: 'babel-spanish',
};

/** Classes que carregam o babel com um idioma fixo (o abnTeX2 pede [brazil]). */
const CLASS_LANGUAGES: Record<string, string> = { abntex2: 'brazil' };

/**
 * Pacotes de idioma que o documento vai pedir ao babel (opções da classe, do
 * \usepackage{babel} e o idioma fixo de classes como o abnTeX2). O Siglum não
 * guarda o .ldf desses pacotes; o compilador manda os arquivos junto com o
 * documento (ver texlive-files.ts).
 */
export function babelLanguagePackages(source: string): string[] {
  const text = stripComments(source);
  const languages = new Set<string>();
  const documentClass = /\\documentclass\s*(?:\[([^\]]*)\])?\s*\{([^}]+)\}/.exec(text);
  const options = [documentClass?.[1] ?? ''];
  for (const match of text.matchAll(/\\(?:usepackage|RequirePackage)\s*\[([^\]]*)\]\s*\{[^}]*\bbabel\b[^}]*\}/g)) options.push(match[1]!);
  for (const match of text.matchAll(/\\babelprovide\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}/g)) options.push(match[1]!);
  for (const list of options) for (const option of list.split(',')) languages.add(option.trim());
  const fixed = documentClass ? CLASS_LANGUAGES[documentClass[2]!.trim()] : undefined;
  if (fixed) languages.add(fixed);
  return [...new Set([...languages].flatMap((language) => (BABEL_LANGUAGE_PACKAGES[language] ? [BABEL_LANGUAGE_PACKAGES[language]] : [])))];
}

/**
 * Refaz o .brf do backref a partir do .aux. Entre uma passagem e outra o
 * Siglum guarda só .aux, .toc, .lof, .lot, .out e .bbl; o backref lê as
 * páginas de cada citação no .brf da passagem anterior, que se perde, e toda
 * referência sairia "Nenhuma citação no texto". As mesmas linhas estão no .aux
 * como \@writefile{brf}{...}; no começo do \begin{document}, antes de o LaTeX
 * reabrir o .aux para escrita, elas viram o .brf. Uma linha só, colada ao
 * \begin{document}, para não mudar a numeração das linhas.
 */
const BACKREF_FROM_AUX = [
  '\\ExplSyntaxOn',
  '\\ior_new:N \\g__overdoctex_aux_ior \\iow_new:N \\g__overdoctex_brf_iow',
  '\\cs_new_protected:Npn \\__overdoctex_brf_from_aux: { \\file_if_exist:nT { \\c_sys_jobname_str .aux } {',
  '\\iow_open:Nn \\g__overdoctex_brf_iow { \\c_sys_jobname_str .brf } \\ior_open:Nn \\g__overdoctex_aux_ior { \\c_sys_jobname_str .aux }',
  '\\ior_str_map_inline:Nn \\g__overdoctex_aux_ior { \\str_if_eq:eeT { \\str_range:nnn {##1} {1} {17} }',
  '{ \\c_backslash_str @writefile \\c_left_brace_str brf \\c_right_brace_str \\c_left_brace_str }',
  '{ \\iow_now:Ne \\g__overdoctex_brf_iow { \\str_range:nnn {##1} {18} {-2} } } }',
  '\\ior_close:N \\g__overdoctex_aux_ior \\iow_close:N \\g__overdoctex_brf_iow } }',
  '\\AddToHook{begindocument/before}{\\__overdoctex_brf_from_aux:}',
  '\\ExplSyntaxOff',
].join(' ');

/** Documento com backref (pacote ou opção backref/pagebackref do hyperref) ganha a reconstrução do .brf. */
export function withBackrefFromAux(source: string): string {
  const begin = /\\begin\s*\{document\}/.exec(source);
  if (!begin || !/\bbackref\b|\bpagebackref\b/.test(stripComments(source.slice(0, begin.index)))) return source;
  return `${source.slice(0, begin.index)}${BACKREF_FROM_AUX}${source.slice(begin.index)}`;
}

/** Classes que carregam o hyperref sozinhas (e com ele os marcadores do PDF). */
const HYPERREF_CLASSES = new Set(['abntex2', 'beamer']);

/**
 * Mesmas expressões do Siglum (predictRequiredPasses, no worker dele): com uma
 * delas no principal, ele já compila mais de uma vez quando o log pede.
 */
const SIGLUM_MULTIPASS =
  /\\(?:tableofcontents|listoffigures|listoftables|printindex|makeindex)\b|\\(?:ref\{|pageref\{|eqref\{|autoref\{|cite[pt]?\{|citep\{|citet\{|autocite\{|textcite\{|label\{|bibliography\{|printbibliography|addbibresource)/;

/**
 * Os marcadores do hyperref (o índice do PDF) só entram na segunda passagem:
 * a primeira grava o .out e o log pede "Rerun to get outlines right". O Siglum
 * decide as passagens pelo texto do principal e, sem referências nem sumário,
 * faria uma só. O comentário no fim (depois do \end{document}, sem efeito no
 * documento) libera a segunda passagem, que ainda depende do aviso no log.
 */
export function withOutlinePass(source: string, usesHyperref: boolean): string {
  if (!usesHyperref || SIGLUM_MULTIPASS.test(source)) return source;
  return `${source}\n% \\label{} (OverDocTeX: os marcadores do hyperref, o índice do PDF, saem na segunda passagem)\n`;
}

const PACKAGE_COMMAND = /\\(?:usepackage|RequirePackage)\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}/g;

/** Pacotes pedidos por \usepackage e \RequirePackage (fora de comentários). */
function packagesIn(text: string): string[] {
  return [...stripComments(text).matchAll(PACKAGE_COMMAND)].flatMap((match) => match[1]!.split(',').map((name) => name.trim())).filter(Boolean);
}

/**
 * O Siglum escolhe os conjuntos de pacotes (bundles) que carrega de saída
 * lendo só o principal. Pacotes pedidos em outros arquivos do projeto
 * (preâmbulo num \input, .sty próprio) só aparecem quando o TeX para por falta
 * deles, um por tentativa, e as tentativas acabam antes do fim: no modelo de
 * TCC do INATEL, com os pacotes em configuracoes/includes.tex, a oitava falta
 * era o xcolor. Um comentário no fim do principal, depois do \end{document} e
 * sem efeito no documento, lista esses pacotes para o Siglum carregar os
 * conjuntos deles de saída. Pacotes do próprio projeto (`localPackages`) ficam
 * de fora.
 */
export function withProjectPackages(source: string, mainPackages: readonly string[], projectPackages: readonly string[], localPackages: ReadonlySet<string>): string {
  const inMain = new Set(mainPackages);
  const extra = [...new Set(projectPackages)].filter((name) => /^[\w-]+$/.test(name) && !inMain.has(name) && !localPackages.has(name));
  if (extra.length === 0) return source;
  return `${source}\n% \\usepackage{${extra.join(',')}} (OverDocTeX: pacotes pedidos em outros arquivos do projeto)\n`;
}

/** Caminho visto a partir da pasta do arquivo principal (o compilador roda nela). */
export function relativeToMain(path: string, mainPath: string): string {
  const folder = mainPath.includes('/') ? mainPath.slice(0, mainPath.lastIndexOf('/') + 1) : '';
  return folder && path.startsWith(folder) ? path.slice(folder.length) : path;
}

const FILE_REFERENCE = /\\(?:includegraphics|includepdf|includesvg|input|include|subfile|lstinputlisting|verbatiminput|inputminted)\*?\s*(?:\[[^\]]*\]\s*)*(?:\{[^}]*\}\s*)?\{([^}]+)\}/g;
const REFERENCE_EXTENSIONS = ['', '.tex', '.png', '.pdf', '.jpg', '.jpeg', '.eps', '.svg'];

/**
 * Caminhos citados no projeto (\includegraphics, \input...) que não existem
 * como estão, mas existem sem as primeiras pastas: um zip importado sem a
 * pasta raiz (figuras citadas como "TCC/figuras/x.png" com o projeto já sem
 * "TCC/"), ou caminhos escritos a partir da raiz com o principal numa pasta.
 * O arquivo vai também no caminho citado, como o TeX vai procurar.
 */
export function referencedAliases(files: Readonly<Record<string, string | Uint8Array>>, sources: readonly string[]): Record<string, string | Uint8Array> {
  const aliases: Record<string, string | Uint8Array> = {};
  const has = (path: string) => path in files || path in aliases;
  for (const source of sources) {
    for (const match of stripComments(source).matchAll(FILE_REFERENCE)) {
      // \inputminted{lang}{arquivo}: o último grupo é o arquivo.
      const wanted = match[1]!.trim().replace(/^\.\//, '');
      if (!wanted || REFERENCE_EXTENSIONS.some((extension) => has(wanted + extension))) continue;
      const segments = wanted.split('/');
      for (let drop = 1; drop < segments.length; drop++) {
        const candidate = segments.slice(drop).join('/');
        const extension = REFERENCE_EXTENSIONS.find((ext) => candidate + ext in files);
        if (extension === undefined) continue;
        aliases[wanted + extension] = files[candidate + extension]!;
        break;
      }
    }
  }
  return aliases;
}

export interface CompileInput {
  source: string;
  additionalFiles: Record<string, string | Uint8Array>;
  /** Pacotes do repositório do site cujos arquivos soltos (ex.: .ldf) vão junto com o documento. */
  texlivePackages: string[];
  /** Arquivos soltos pedidos pelo nome (estilos do biblatex): vão junto com todos os do pacote dono. */
  texliveFiles: string[];
  /**
   * .bbl do biblatex, montado depois que os estilos chegam (as opções padrão
   * deles mudam a ordem e os rótulos). Recebe o texto de um arquivo pelo nome.
   */
  biblatexBbl: ((styleFile: (name: string) => string | null) => BiblatexBblResult | null) | null;
}

export function buildCompileInput(
  mainPath: string,
  texts: readonly ProjectTextFile[],
  binaries: ReadonlyMap<string, Uint8Array>,
): CompileInput {
  const main = texts.find((file) => file.path === mainPath);
  if (!main) throw new Error(t('Arquivo principal {path} não encontrado.', { path: mainPath }));
  const additionalFiles: Record<string, string | Uint8Array> = {};
  for (const file of texts) {
    if (file.path !== mainPath) additionalFiles[relativeToMain(file.path, mainPath)] = file.content;
  }
  for (const [path, data] of binaries) additionalFiles[relativeToMain(path, mainPath)] = data;
  let source = withBackrefFromAux(adaptBabel(main.content));
  // Pacotes pedidos no principal ou em outros arquivos do projeto (preâmbulo separado, .sty próprio).
  const others = texts.filter((file) => file.path !== mainPath && /\.(tex|sty|cls)$/.test(file.path));
  const sources = [main.content, ...others.map((file) => file.content)];
  const mainPackages = packagesIn(main.content);
  const otherPackages = others.flatMap((file) => packagesIn(file.content));
  const usedPackages = [...mainPackages, ...otherPackages];
  const localPackages = new Set(texts.filter((file) => /\.(sty|cls)$/.test(file.path)).map((file) => file.path.replace(/^.*\//, '').replace(/\.(sty|cls)$/, '')));
  source = withProjectPackages(source, mainPackages, otherPackages, localPackages);
  // O compilador não tem bibtex nem biber: o .bbl vem pronto (o principal roda como document.tex).
  const textMap = new Map(texts.map((file) => [file.path, file.content]));
  const biblatex = scanBiblatex(textMap, mainPath);
  let texliveFiles: string[] = [];
  let biblatexBbl: CompileInput['biblatexBbl'] = null;
  if (biblatex) {
    // Estilos do biblatex (.bbx, .cbx, .dbx) vêm do repositório; o .bbl é montado quando chegam.
    const { bibstyle, citestyle, datamodels } = stylesFromOptions(biblatex.packageOptions);
    texliveFiles = [`${bibstyle}.bbx`, `${citestyle}.cbx`, ...datamodels.map((name) => `${name}.dbx`)];
    biblatexBbl = (styleFile) => buildBiblatexBbl(textMap, mainPath, styleFile);
    // O Siglum decide as passagens olhando só o principal: sem citação nem bibliografia nele, faria uma só.
    if (!/\\(?:[a-zA-Z]*cite|printbibliography|addbibresource)/.test(main.content)) source += '\n% \\printbibliography (OverDocTeX: bibliografia em arquivos de \\input)\n';
  } else {
    const bibliography = buildBbl(textMap, mainPath);
    if (bibliography) {
      additionalFiles['document.bbl'] = bibliography.bbl;
      // O Siglum decide as passagens olhando só o principal; sem \cite nele, faria uma só e as citações ficariam [?].
      if (!/\\(cite|bibliography)/.test(main.content)) source += '\n% \\bibliography{} (OverDocTeX: citações em arquivos de \\input)\n';
    }
  }
  const documentClass = /\\documentclass\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}/.exec(stripComments(main.content))?.[1]?.trim() ?? '';
  source = withOutlinePass(source, usedPackages.includes('hyperref') || usedPackages.includes('bookmark') || HYPERREF_CLASSES.has(documentClass));
  // Pacotes com arquivos soltos no site (ex.: .ldf): idiomas do babel e os pedidos pelo projeto.
  Object.assign(additionalFiles, referencedAliases(additionalFiles, sources));
  const texlivePackages = [...new Set([...babelLanguagePackages(sources.join('\n')), ...usedPackages.filter(Boolean), ...(biblatex ? ['biblatex'] : [])])];
  return { source, additionalFiles, texlivePackages, texliveFiles, biblatexBbl };
}

/**
 * Caminho que o TeX usa (no log e no SyncTeX) convertido para o caminho no
 * projeto. O principal aparece como /document.tex; os demais, relativos à
 * pasta do principal. Arquivos do TeX Live devolvem nulo.
 */
export function projectPathFromTex(raw: string, mainPath: string): string | null {
  // O SyncTeX do Siglum escreve os incluídos como //./cap/um.tex; o log, como ./cap/um.tex.
  const clean = raw.replace(/^(?:\.?\/)+/, '');
  if (clean.startsWith('texlive/') || clean.startsWith('texmf')) return null;
  if (clean === 'document.tex') return mainPath;
  const folder = mainPath.includes('/') ? mainPath.slice(0, mainPath.lastIndexOf('/') + 1) : '';
  return folder + clean;
}

/**
 * Fontes que o TeX não achou, pelo nome (sem extensão): métrica (.tfm) que
 * não carrega, fonte virtual ou contorno Type 1 (.pfb) que o pdfTeX não abre.
 */
export function missingFonts(log: readonly string[]): string[] {
  const text = log.join('\n');
  const patterns = [
    /! Font [^=\n]*=([^\s]+) at [^\n]*not loadable: Metric \(TFM\) file/g,
    /! Font ([^\s=]+) at [\d.]+(?:pt)? not found/g,
    /!pdfTeX error: [^\n]*\(file ([^)\s]+)\): (?:cannot open Type 1 font file|Font [^\n]* not found)/g,
    /pdfTeX warning: [^\n]*(?:font file|Font) ([^\s]+\.(?:pfb|tfm|vf)) not found/gi,
  ];
  const names = new Set<string>();
  for (const pattern of patterns) for (const match of text.matchAll(pattern)) names.add(match[1]!.replace(/\.(?:tfm|vf|pfb)$/, ''));
  return [...names];
}

export interface TexIssue {
  kind: 'error' | 'missing-package' | 'warning';
  message: string;
  /** Caminho no projeto; nulo quando o TeX não diz de onde veio. */
  file: string | null;
  line: number | null;
}

/**
 * Quantas linhas somar aos números de linha do arquivo principal. O Siglum
 * avisa no log quando muda o texto antes de entregar ao TeX:
 * - com o preâmbulo num formato em cache, o TeX recebe só o trecho a partir
 *   de \begin{document};
 * - com microtype, ele insere 2 linhas antes do \documentclass.
 */
export function mainLineOffset(source: string, workerNotes: readonly string[]): number {
  if (workerNotes.some((note) => note.includes('Using custom format'))) {
    const begin = source.indexOf('\\begin{document}');
    return begin === -1 ? 0 : source.slice(0, begin).split('\n').length - 1;
  }
  return workerNotes.some((note) => note.includes('Injecting microtype')) ? -2 : 0;
}

/**
 * Lê as linhas do TeX (sem o prefixo "[TeX] ") e devolve erros com arquivo e
 * linha. O arquivo é o último .tex do projeto aberto antes do erro; o
 * principal aparece como /document.tex no compilador, e as linhas dele são
 * corrigidas por `lineOffset` (ver mainLineOffset).
 */
export function parseTexLog(lines: readonly string[], mainPath: string, lineOffset = 0): TexIssue[] {
  const issues: TexIssue[] = [];
  const folder = mainPath.includes('/') ? mainPath.slice(0, mainPath.lastIndexOf('/') + 1) : '';
  const toProjectPath = (raw: string) => {
    const clean = raw.replace(/^\.?\//, '');
    return clean === 'document.tex' ? mainPath : folder + clean;
  };
  // Pilha dos parênteses do log: "(arquivo" abre, ")" fecha. Entradas nulas
  // equilibram parênteses que não são de arquivo, como "(babel)".
  const TEXLIVE = '/texlive/';
  const stack: Array<string | null> = [];
  const innermost = () => [...stack].reverse().find((entry) => entry !== null) ?? mainPath;
  const innermostProject = () => [...stack].reverse().find((entry) => entry !== null && entry !== TEXLIVE) ?? mainPath;

  // Citação e referência indefinidas na primeira passagem são normais (o .aux ainda não existe):
  // só contam os avisos da última passagem do TeX.
  const lastPass = lines.reduce((found, line, index) => (/^This is (pdf|Xe|LuaHB)?TeX,/.test(line) ? index : found), 0);

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;

    const missing = line.match(/LaTeX Error: File `([^']+)' not found/);
    if (missing) {
      issues.push({ kind: 'missing-package', message: t('Pacote ou arquivo {file} não disponível no compilador.', { file: missing[1]! }), file: innermostProject(), line: null });
    } else if (line.startsWith('! ')) {
      let lineNumber: number | null = null;
      for (let next = index + 1; next < Math.min(lines.length, index + 12); next++) {
        const at = lines[next]!.match(/^l\.(\d+)/);
        if (at) {
          lineNumber = Number(at[1]);
          break;
        }
      }
      const file = innermostProject();
      // Erro lido dentro de um pacote do TeX Live: a linha é a do pacote, não a do projeto.
      if (innermost() === TEXLIVE) lineNumber = null;
      else if (lineNumber !== null && file === mainPath) lineNumber = Math.max(1, lineNumber + lineOffset);
      const message = line.slice(2).replace(/^(LaTeX|Package \w+) Error:\s*/, '').trim();
      if (!/Emergency stop|Fatal error occurred/.test(message)) issues.push({ kind: 'error', message, file, line: lineNumber });
    } else {
      const warning = index >= lastPass ? line.match(/LaTeX Warning: (Citation|Reference) `([^']+)' .*undefined/) : null;
      if (warning) {
        const message = warning[1] === 'Citation' ? t('Citação {key} indefinida', { key: warning[2]! }) : t('Referência {key} indefinida', { key: warning[2]! });
        issues.push({ kind: 'warning', message, file: innermostProject(), line: null });
      }
    }

    // Nome com espaço ("secoes/04 - Resultados.tex") vai até a extensão; sem extensão conhecida, até o espaço.
    for (const token of line.matchAll(/\((\.?\/[^()\n]*?\.(?:tex|ltx|sty|cls|bbl|def|cfg|clo|fd)(?=[\s)]|$)|\.?\/[^\s()]*)?|\)/g)) {
      if (token[0] === ')') stack.pop();
      else if (token[1]) stack.push(token[1].startsWith(TEXLIVE) ? TEXLIVE : toProjectPath(token[1]));
      else stack.push(null);
    }
  }
  // O compilador roda o TeX mais de uma vez (sumário, referências): cada problema aparece uma vez só.
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.kind}|${issue.message}|${issue.file}|${issue.line}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
