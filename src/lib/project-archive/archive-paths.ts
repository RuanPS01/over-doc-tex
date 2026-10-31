import type { FileKind } from '@shared/firestore/types';

/** Arquivos de sistema que zips e pastas costumam trazer e que não pertencem ao projeto. */
const JUNK = /(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db|desktop\.ini|\.git)(\/|$)|(^|\/)\._[^/]*$/i;

const MAX_PATH_LENGTH = 512;

/**
 * Normaliza um caminho vindo de zip ou do dispositivo para "pasta/arquivo.ext".
 * Devolve `null` para entradas que não podem entrar no projeto: caminhos que
 * sobem de pasta ("..", proteção contra zip slip), absolutos, com unidade de
 * disco, com caracteres de controle ou arquivos de sistema.
 */
export function normalizeArchivePath(raw: string): string | null {
  const unified = raw.replace(/\\/g, '/').replace(/^(\.\/)+/, '');
  if (/^[a-z]:/i.test(unified) || unified.startsWith('/')) return null;
  if (/[\u0000-\u001f]/.test(unified)) return null;
  const segments = unified.split('/').filter((segment) => segment !== '' && segment !== '.');
  if (segments.length === 0 || segments.some((segment) => segment === '..')) return null;
  const path = segments.join('/');
  if (path.length > MAX_PATH_LENGTH || JUNK.test(path)) return null;
  return path;
}

/** Junta a pasta de destino ("" é a raiz) com o caminho relativo. */
export function joinPath(folder: string, path: string): string {
  return folder ? `${folder.replace(/\/+$/, '')}/${path}` : path;
}

export function fileNameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

const TEXT_EXTENSIONS = new Set([
  'tex', 'ltx', 'bib', 'bst', 'sty', 'cls', 'clo', 'cfg', 'def', 'dtx', 'ins', 'ist', 'bbx', 'cbx', 'lbx',
  'txt', 'md', 'csv', 'tsv', 'dat', 'json', 'yaml', 'yml', 'xml', 'latexmkrc',
]);

const extensionOf = (path: string) => {
  const name = fileNameOf(path).toLowerCase();
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? name.replace(/^\./, '') : name.slice(dot + 1);
};

export function classifyFileKind(path: string): FileKind {
  const extension = extensionOf(path);
  if (extension === 'tex' || extension === 'ltx') return 'tex';
  if (extension === 'bib') return 'bib';
  if (extension === 'sty') return 'sty';
  if (extension === 'cls') return 'cls';
  if (extension === 'pdf') return 'pdf';
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'eps', 'bmp', 'tif', 'tiff'].includes(extension)) return 'image';
  if (['csv', 'tsv', 'dat', 'json', 'txt'].includes(extension)) return 'data';
  return 'other';
}

/** Arquivos de texto ficam no Firestore e abrem no editor; os demais vão para o Storage. */
export function isTextPath(path: string): boolean {
  return TEXT_EXTENSIONS.has(extensionOf(path));
}

/**
 * "capitulo.tex" vira "capitulo-1.tex", "capitulo-2.tex"...; sem extensão,
 * "Makefile-1". Arquivo oculto (".latexmkrc") recebe o sufixo no fim.
 */
export function uniquePath(path: string, taken: ReadonlySet<string>): string {
  if (!taken.has(path)) return path;
  const slash = path.lastIndexOf('/');
  const folder = path.slice(0, slash + 1);
  const name = path.slice(slash + 1);
  const dot = name.lastIndexOf('.');
  const [base, extension] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
  for (let counter = 1; ; counter++) {
    const candidate = `${folder}${base}-${counter}${extension}`;
    if (!taken.has(candidate)) return candidate;
  }
}
