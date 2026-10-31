import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { classifyFileKind, isTextPath, normalizeArchivePath, uniquePath } from '@/lib/project-archive/archive-paths';
import { planImport, singleRootFolder, stripRootFolder } from '@/lib/project-archive/import-plan';
import { ImportLimitError, buildZip, readZip } from '@/lib/project-archive/zip';

const entry = (path: string) => ({ path, data: strToU8(path) });

describe('normalizeArchivePath', () => {
  it('normaliza separadores e prefixos', () => {
    expect(normalizeArchivePath('./cap/intro.tex')).toBe('cap/intro.tex');
    expect(normalizeArchivePath('cap\\fig.png')).toBe('cap/fig.png');
  });

  it('bloqueia zip slip, caminhos absolutos e arquivos de sistema', () => {
    expect(normalizeArchivePath('../evil.tex')).toBeNull();
    expect(normalizeArchivePath('a/../../b')).toBeNull();
    expect(normalizeArchivePath('/etc/passwd')).toBeNull();
    expect(normalizeArchivePath('C:/x.tex')).toBeNull();
    expect(normalizeArchivePath('__MACOSX/._main.tex')).toBeNull();
    expect(normalizeArchivePath('pasta/.DS_Store')).toBeNull();
  });
});

describe('uniquePath', () => {
  it('acrescenta -1, -2... antes da extensão', () => {
    expect(uniquePath('cap/intro.tex', new Set(['cap/intro.tex']))).toBe('cap/intro-1.tex');
    expect(uniquePath('cap/intro.tex', new Set(['cap/intro.tex', 'cap/intro-1.tex']))).toBe('cap/intro-2.tex');
  });

  it('trata nomes sem extensão e arquivos ocultos', () => {
    expect(uniquePath('Makefile', new Set(['Makefile']))).toBe('Makefile-1');
    expect(uniquePath('.latexmkrc', new Set(['.latexmkrc']))).toBe('.latexmkrc-1');
  });
});

it('classifica tipo e decide o que é texto', () => {
  expect(classifyFileKind('a/b.TEX')).toBe('tex');
  expect(classifyFileKind('x.png')).toBe('image');
  expect(isTextPath('refs.bib')).toBe(true);
  expect(isTextPath('fig.png')).toBe(false);
});

describe('planImport', () => {
  const existingPaths = ['main.tex', 'cap/intro.tex'];

  it('sobrescreve o arquivo de mesmo caminho', () => {
    const plan = planImport({ existingPaths, entries: [entry('main.tex'), entry('novo.tex')], targetFolder: '', conflict: 'overwrite' });
    expect(plan.overwriteCount).toBe(1);
    expect(plan.createCount).toBe(1);
    expect(plan.operations[0]?.targetPath).toBe('main.tex');
  });

  it('mantém os dois renomeando o importado', () => {
    const plan = planImport({ existingPaths, entries: [entry('main.tex')], targetFolder: '', conflict: 'keep-both' });
    expect(plan.operations[0]).toMatchObject({ targetPath: 'main-1.tex', action: 'create', renamed: true });
  });

  it('importa para uma pasta interna', () => {
    const plan = planImport({ existingPaths, entries: [entry('intro.tex')], targetFolder: 'cap', conflict: 'keep-both' });
    expect(plan.operations[0]?.targetPath).toBe('cap/intro-1.tex');
  });

  it('detecta e remove a pasta raiz única do zip', () => {
    const rooted = [entry('projeto/main.tex'), entry('projeto/cap/a.tex')];
    expect(singleRootFolder(rooted)).toBe('projeto');
    expect(stripRootFolder(rooted, 'projeto').map((item) => item.path)).toEqual(['main.tex', 'cap/a.tex']);
  });
});

describe('zip', () => {
  it('lê o zip sem pastas, sem lixo de sistema e sem zip slip', () => {
    const zip = zipSync({
      'main.tex': strToU8('\\documentclass{article}'),
      'fig/a.png': new Uint8Array([1, 2, 3]),
      '../evil.tex': strToU8('x'),
      '__MACOSX/._main.tex': strToU8('x'),
      'vazia/': new Uint8Array(),
    });
    const { entries, skipped } = readZip(zip);
    expect(entries.map((item) => item.path)).toEqual(['fig/a.png', 'main.tex']);
    expect(skipped).toHaveLength(2);
  });

  it('preserva o conteúdo na ida e volta', () => {
    const { entries } = readZip(buildZip([{ path: 'main.tex', data: strToU8('% texto') }]));
    expect(new TextDecoder().decode(entries[0]?.data)).toBe('% texto');
  });

  it('recusa zip acima do limite de arquivos antes de descompactar', () => {
    const many: Record<string, Uint8Array> = {};
    for (let index = 0; index < 2001; index++) many[`f${index}.txt`] = strToU8('x');
    expect(() => readZip(zipSync(many))).toThrow(ImportLimitError);
  });
});
