/**
 * Árvore de arquivos do editor (pura): pastas implícitas nos caminhos,
 * ordenação, pastas no topo ou misturadas e pastas recolhidas.
 */
import type { EditorFile } from './editor-file';

export type FileTreeSort = 'name' | 'name-desc' | 'type' | 'modified' | 'size';

export interface FileTreeOptions {
  sort: FileTreeSort;
  /** Pastas antes dos arquivos em cada nível; falso mistura as duas na mesma ordenação. */
  foldersFirst: boolean;
}

export const DEFAULT_FILE_TREE_OPTIONS: FileTreeOptions = { sort: 'name', foldersFirst: true };

export const FILE_TREE_SORTS: readonly { value: FileTreeSort; label: string }[] = [
  { value: 'name', label: 'Nome (A a Z)' },
  { value: 'name-desc', label: 'Nome (Z a A)' },
  { value: 'type', label: 'Tipo (extensão)' },
  { value: 'modified', label: 'Modificados por último' },
  { value: 'size', label: 'Tamanho (maiores primeiro)' },
];

export function isFileTreeSort(value: unknown): value is FileTreeSort {
  return FILE_TREE_SORTS.some((sort) => sort.value === value);
}

export interface FileTreeRow {
  /** Caminho da pasta ou id do arquivo. */
  key: string;
  depth: number;
  label: string;
  /** Nulo nas pastas. */
  file: EditorFile | null;
  /** Só pastas: caminho completo ("capitulos/anexos"). */
  folderPath: string | null;
  expanded: boolean;
  /** Só pastas: arquivos dentro dela, em qualquer nível. */
  fileCount: number;
}

interface FolderNode {
  kind: 'folder';
  name: string;
  path: string;
  folders: Map<string, FolderNode>;
  files: EditorFile[];
  fileCount: number;
  size: number;
  /** Gravação mais recente lá dentro; Infinity quando há gravação ainda não confirmada. */
  modified: number;
}

type TreeNode = FolderNode | { kind: 'file'; name: string; file: EditorFile };

const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });

/** Pastas que contêm o caminho, da mais externa à mais interna: "a/b/c.tex" dá ["a", "a/b"]. */
export function ancestorFolders(path: string): string[] {
  const parts = path.split('/').slice(0, -1);
  return parts.map((_, index) => parts.slice(0, index + 1).join('/'));
}

/** Todas as pastas implícitas nos caminhos dos arquivos. */
export function allFolders(files: readonly EditorFile[]): string[] {
  return [...new Set(files.flatMap((file) => ancestorFolders(file.path)))];
}

const modifiedOf = (file: EditorFile) => file.updatedAt ?? Number.POSITIVE_INFINITY;

function buildTree(files: readonly EditorFile[]): FolderNode {
  const root: FolderNode = { kind: 'folder', name: '', path: '', folders: new Map(), files: [], fileCount: 0, size: 0, modified: 0 };
  for (const file of files) {
    let folder = root;
    const trail = [root];
    for (const name of file.path.split('/').slice(0, -1)) {
      let child = folder.folders.get(name);
      if (!child) {
        child = { kind: 'folder', name, path: folder.path ? `${folder.path}/${name}` : name, folders: new Map(), files: [], fileCount: 0, size: 0, modified: 0 };
        folder.folders.set(name, child);
      }
      folder = child;
      trail.push(child);
    }
    folder.files.push(file);
    for (const node of trail) {
      node.fileCount++;
      node.size += file.size;
      node.modified = Math.max(node.modified, modifiedOf(file));
    }
  }
  return root;
}

/** Extensão para a ordenação por tipo ("" para arquivos sem extensão). */
function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

function compareNodes(a: TreeNode, b: TreeNode, { sort, foldersFirst }: FileTreeOptions): number {
  // Na ordenação por tipo a pasta é um tipo à parte e fica antes dos arquivos.
  if ((foldersFirst || sort === 'type') && a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
  const byName = collator.compare(a.name, b.name);
  switch (sort) {
    case 'name':
      return byName;
    case 'name-desc':
      return -byName;
    case 'type': {
      if (a.kind === 'folder') return byName;
      return collator.compare(extensionOf(a.name), extensionOf(b.name)) || byName;
    }
    case 'modified': {
      const modifiedA = a.kind === 'folder' ? a.modified : modifiedOf(a.file);
      const modifiedB = b.kind === 'folder' ? b.modified : modifiedOf(b.file);
      return modifiedA === modifiedB ? byName : modifiedB > modifiedA ? 1 : -1;
    }
    case 'size': {
      const sizeA = a.kind === 'folder' ? a.size : a.file.size;
      const sizeB = b.kind === 'folder' ? b.size : b.file.size;
      return sizeB - sizeA || byName;
    }
  }
}

/**
 * Linhas visíveis da árvore: cada pasta seguida do conteúdo só se estiver em
 * `expanded`; o resto fica escondido até ela ser aberta.
 */
export function fileTreeRows(files: readonly EditorFile[], options: FileTreeOptions, expanded: ReadonlySet<string>): FileTreeRow[] {
  const rows: FileTreeRow[] = [];
  const visit = (folder: FolderNode, depth: number) => {
    const children: TreeNode[] = [
      ...folder.folders.values(),
      ...folder.files.map((file) => ({ kind: 'file' as const, name: file.name, file })),
    ].sort((a, b) => compareNodes(a, b, options));
    for (const child of children) {
      if (child.kind === 'file') {
        rows.push({ key: child.file.id, depth, label: child.name, file: child.file, folderPath: null, expanded: false, fileCount: 0 });
        continue;
      }
      const isOpen = expanded.has(child.path);
      rows.push({ key: child.path, depth, label: child.name, file: null, folderPath: child.path, expanded: isOpen, fileCount: child.fileCount });
      if (isOpen) visit(child, depth + 1);
    }
  };
  visit(buildTree(files), 0);
  return rows;
}
