import { describe, expect, it } from 'vitest';
import { pickFallbackFile, type EditorFile } from '@/features/editor/model/editor-file';
import {
  MAIN_FILE_ID,
  buildNewProject,
  escapeLatex,
  normalizeProjectName,
  starterTex,
} from '@/features/projects/model/new-project';

const file = (id: string, path: string, content: string | null, kind: EditorFile['kind'] = 'tex'): EditorFile => ({
  id,
  path,
  name: path.split('/').pop()!,
  kind,
  content,
  blobPath: null,
  size: content?.length ?? 0,
  updatedAt: null,
});

describe('projeto novo', () => {
  it('normaliza o nome e recusa nome vazio', () => {
    expect(normalizeProjectName('  Minha   tese  ')).toBe('Minha tese');
    expect(normalizeProjectName('   ')).toBeNull();
    expect(normalizeProjectName('x'.repeat(300))).toHaveLength(120);
  });

  it('escapa caracteres especiais do LaTeX no título', () => {
    expect(escapeLatex('P&D 100% em C#_1 {a}')).toBe('P\\&D 100\\% em C\\#\\_1 \\{a\\}');
    expect(starterTex('Ana & Bia')).toContain('\\title{Ana \\& Bia}');
  });

  it('monta o projeto como as regras de criação exigem', () => {
    const now = { sentinela: true };
    const { project, document, file: main } = buildNewProject({ uid: 'ana', name: 'Tese', content: 'abc', contentHash: 'h', now });
    // Mesmas condições de "allow create" em firestore.rules.
    expect(project.ownerId).toBe('ana');
    expect(project.members).toEqual({ ana: 'owner' });
    expect(project.memberIds).toEqual(['ana']);
    expect(project.pendingMembers).toEqual({});
    expect(project.counters).toEqual({ snapshots: 0, reviews: 0 });
    expect(project.updatedAt).toBe(now);
    expect(document.rootFileId).toBe(MAIN_FILE_ID);
    expect(main).toMatchObject({ path: 'main.tex', updatedBy: 'ana', size: 3, revision: 1, blobPath: null });
  });
});

describe('arquivo inicial do editor', () => {
  it('prefere o main.tex da raiz, depois o primeiro .tex, depois o primeiro texto', () => {
    const bib = file('b', 'refs.bib', '@a{}', 'bib');
    const chapter = file('c', 'cap/um.tex', 'x');
    const root = file('m', 'main.tex', 'x');
    const image = file('i', 'fig.png', null, 'image');
    expect(pickFallbackFile([image, bib, chapter, root])?.id).toBe('m');
    expect(pickFallbackFile([image, bib, chapter])?.id).toBe('c');
    expect(pickFallbackFile([image, bib])?.id).toBe('b');
    expect(pickFallbackFile([image])).toBeNull();
  });
});
