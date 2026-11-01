import { describe, expect, it } from 'vitest';
import type { EditorFile } from '@/features/editor/model/editor-file';
import { allFolders, ancestorFolders, DEFAULT_FILE_TREE_OPTIONS, fileTreeRows, type FileTreeOptions } from '@/features/editor/model/file-tree';

const file = (path: string, size = 10, updatedAt: number | null = 1): EditorFile => ({
  id: path,
  path,
  name: path.split('/').pop()!,
  kind: path.endsWith('.tex') ? 'tex' : path.endsWith('.bib') ? 'bib' : 'other',
  content: '',
  blobPath: null,
  size,
  updatedAt,
});

const FILES = [
  file('main.tex', 500, 50),
  file('capitulos/cap10.tex', 30, 10),
  file('capitulos/cap2.tex', 20, 40),
  file('capitulos/anexos/a.tex', 5, 5),
  file('referencias.bib', 100, 20),
  file('figuras/arq.pdf', 9000, 1),
  file('abstract.tex', 50, null),
];

const labels = (options: Partial<FileTreeOptions>, expanded: string[] = []) =>
  fileTreeRows(FILES, { ...DEFAULT_FILE_TREE_OPTIONS, ...options }, new Set(expanded)).map((row) => `${'  '.repeat(row.depth)}${row.label}`);

describe('árvore de arquivos', () => {
  it('por padrão: pastas recolhidas, no topo e em ordem alfabética', () => {
    expect(labels({})).toEqual(['capitulos', 'figuras', 'abstract.tex', 'main.tex', 'referencias.bib']);
    const [capitulos] = fileTreeRows(FILES, DEFAULT_FILE_TREE_OPTIONS, new Set());
    expect(capitulos).toMatchObject({ folderPath: 'capitulos', expanded: false, fileCount: 3 });
  });

  it('pasta aberta mostra o conteúdo, com números em ordem natural (cap2 antes de cap10)', () => {
    expect(labels({}, ['capitulos'])).toEqual(['capitulos', '  anexos', '  cap2.tex', '  cap10.tex', 'figuras', 'abstract.tex', 'main.tex', 'referencias.bib']);
    expect(labels({}, ['capitulos', 'capitulos/anexos']).slice(0, 3)).toEqual(['capitulos', '  anexos', '    a.tex']);
  });

  it('pastas misturadas com os arquivos e ordem de Z a A', () => {
    expect(labels({ foldersFirst: false })).toEqual(['abstract.tex', 'capitulos', 'figuras', 'main.tex', 'referencias.bib']);
    expect(labels({ sort: 'name-desc' })).toEqual(['figuras', 'capitulos', 'referencias.bib', 'main.tex', 'abstract.tex']);
  });

  it('por tipo: pastas primeiro, depois a extensão', () => {
    expect(labels({ sort: 'type', foldersFirst: false })).toEqual(['capitulos', 'figuras', 'referencias.bib', 'abstract.tex', 'main.tex']);
  });

  it('por modificação: gravação pendente é a mais recente; a pasta vale pelo arquivo mais novo dentro dela', () => {
    expect(labels({ sort: 'modified', foldersFirst: false })).toEqual(['abstract.tex', 'main.tex', 'capitulos', 'referencias.bib', 'figuras']);
  });

  it('por tamanho: a pasta soma o que tem dentro', () => {
    expect(labels({ sort: 'size', foldersFirst: false })).toEqual(['figuras', 'main.tex', 'referencias.bib', 'capitulos', 'abstract.tex']);
  });

  it('pastas implícitas nos caminhos', () => {
    expect(ancestorFolders('a/b/c.tex')).toEqual(['a', 'a/b']);
    expect(ancestorFolders('main.tex')).toEqual([]);
    expect(allFolders(FILES).sort()).toEqual(['capitulos', 'capitulos/anexos', 'figuras']);
  });
});
