/**
 * Preparação do projeto para o compilador (puro, sem I/O): qual arquivo é o
 * principal, quais arquivos vão junto e como ler os erros do log do TeX.
 */

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

/** Idiomas cujo .ldf não vem no compilador: carregados pelos arquivos de localidade do babel. */
const BABEL_ALIASES: Record<string, string> = {
  brazil: 'brazilian',
  brazilian: 'brazilian',
  portuges: 'portuguese',
  portuguese: 'portuguese',
};

/**
 * O compilador não traz o babel-portuges (brazil.ldf). Só na compilação, as
 * opções do babel trocam os nomes antigos pelos de localidade e ganham
 * provide=*, que carrega o idioma pelos arquivos .ini. O .tex do usuário não
 * muda e continua compatível com outros editores.
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

/** Caminho visto a partir da pasta do arquivo principal (o compilador roda nela). */
export function relativeToMain(path: string, mainPath: string): string {
  const folder = mainPath.includes('/') ? mainPath.slice(0, mainPath.lastIndexOf('/') + 1) : '';
  return folder && path.startsWith(folder) ? path.slice(folder.length) : path;
}

export interface CompileInput {
  source: string;
  additionalFiles: Record<string, string | Uint8Array>;
}

export function buildCompileInput(
  mainPath: string,
  texts: readonly ProjectTextFile[],
  binaries: ReadonlyMap<string, Uint8Array>,
): CompileInput {
  const main = texts.find((file) => file.path === mainPath);
  if (!main) throw new Error(`Arquivo principal ${mainPath} não encontrado.`);
  const additionalFiles: Record<string, string | Uint8Array> = {};
  for (const file of texts) {
    if (file.path !== mainPath) additionalFiles[relativeToMain(file.path, mainPath)] = file.content;
  }
  for (const [path, data] of binaries) additionalFiles[relativeToMain(path, mainPath)] = data;
  return { source: adaptBabel(main.content), additionalFiles };
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

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;

    const missing = line.match(/LaTeX Error: File `([^']+)' not found/);
    if (missing) {
      issues.push({ kind: 'missing-package', message: `Pacote ou arquivo ${missing[1]} não disponível no compilador.`, file: innermostProject(), line: null });
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
      const warning = line.match(/LaTeX Warning: (Citation|Reference) `([^']+)' .*undefined/);
      if (warning) {
        issues.push({ kind: 'warning', message: `${warning[1] === 'Citation' ? 'Citação' : 'Referência'} ${warning[2]} indefinida`, file: innermostProject(), line: null });
      }
    }

    for (const token of line.matchAll(/\((\.?\/[^\s()]*)?|\)/g)) {
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
