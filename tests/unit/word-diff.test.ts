import { describe, expect, it } from 'vitest';
import { diffStats, diffText, diffWords, editSteps, normalizePdfText, toDiffRows, tokenize, type DiffSegment } from '@/lib/diff/word-diff';

const join = (segments: DiffSegment[], keep: 'before' | 'after') =>
  segments.filter((segment) => segment.op === 'equal' || segment.op === (keep === 'before' ? 'delete' : 'insert')).map((segment) => segment.text).join('');

describe('Myers', () => {
  it('acha a menor sequência de passos', () => {
    const steps = editSteps([...'ABCABBA'], [...'CBABAC'])!;
    expect(steps.filter((step) => step !== 'equal')).toHaveLength(5);
  });

  it('lida com lados vazios', () => {
    expect(editSteps([], [])).toEqual([]);
    expect(editSteps(['a'], [])).toEqual(['delete']);
    expect(editSteps([], ['a', 'b'])).toEqual(['insert', 'insert']);
  });
});

describe('diff por palavra', () => {
  it('mantém comandos LaTeX inteiros', () => {
    expect(tokenize('\\section{Introdução} texto')).toEqual(['\\section', '{', 'Introdução', '}', ' ', 'texto']);
  });

  it('marca só as palavras inseridas, como no exemplo do fluxo do diff', () => {
    const before = 'Os resultados indicam melhora.';
    const after = 'Os resultados indicam uma melhora significativa \\cite{silva2020}.';
    const segments = diffWords(before, after);
    expect(join(segments, 'before')).toBe(before);
    expect(join(segments, 'after')).toBe(after);
    expect(segments.filter((segment) => segment.op === 'delete')).toHaveLength(0);
    expect(diffStats(segments)).toEqual({ insertedWords: 4, deletedWords: 0 });
  });

  it('absorve igualdades curtas entre edições', () => {
    const segments = diffWords('o gato preto dorme muito', 'o cão branco dorme muito');
    expect(segments).toEqual([
      { op: 'equal', text: 'o ' },
      { op: 'delete', text: 'gato preto' },
      { op: 'insert', text: 'cão branco' },
      { op: 'equal', text: ' dorme muito' },
    ]);
  });

  it('trecho quase todo reescrito aparece inteiro, antigo e novo', () => {
    expect(diffWords('um dois três quatro', 'cinco seis sete oito')).toEqual([
      { op: 'delete', text: 'um dois três quatro' },
      { op: 'insert', text: 'cinco seis sete oito' },
    ]);
  });
});

describe('diff de texto', () => {
  const before = ['\\section{Um}', 'Primeiro parágrafo.', '', 'Segundo parágrafo sem mudança.', 'Fim.', ''].join('\n');
  const after = ['\\section{Um}', 'Primeiro parágrafo revisado.', '', 'Segundo parágrafo sem mudança.', 'Linha nova.', 'Fim.', ''].join('\n');

  it('reconstrói os dois lados', () => {
    const segments = diffText(before, after);
    expect(join(segments, 'before')).toBe(before);
    expect(join(segments, 'after')).toBe(after);
    expect(diffStats(segments)).toEqual({ insertedWords: 3, deletedWords: 0 });
  });

  it('mostra as linhas alteradas com contexto e numera pelo texto novo', () => {
    const rows = toDiffRows(diffText(before, after), 0);
    expect(rows.map((row) => (row.kind === 'line' ? row.number : `pula ${row.count}`))).toEqual([
      'pula 1',
      2,
      'pula 2',
      5,
      'pula 1',
    ]);
  });

  it('linha vazia que vira texto é só inserção, e linha vazia nova ganha número', () => {
    const segments = diffText('a\n\nfim\n', 'a\nTexto novo.\nfim\n\n% nota');
    expect(segments.filter((segment) => segment.op === 'delete')).toHaveLength(0);
    const rows = toDiffRows(segments, 0);
    expect(rows.map((row) => (row.kind === 'line' ? row.number : `pula ${row.count}`))).toEqual(['pula 1', 2, 'pula 1', 4, 5]);
  });

  it('textos iguais não têm linhas alteradas', () => {
    expect(toDiffRows(diffText('a\nb\n', 'a\nb\n'))).toEqual([{ kind: 'skip', count: 2 }]);
  });
});

describe('comparação de árvores', () => {
  it('lista arquivos novos, removidos e alterados, ignorando os iguais', async () => {
    const { compareTrees } = await import('@/lib/diff/file-changes');
    const base = new Map([
      ['main.tex', { text: 'Olá mundo.\n' }],
      ['cap/velho.tex', { text: 'Texto antigo.\n' }],
      ['fig.png', { hash: 'a' }],
      ['igual.tex', { text: 'x\n' }],
    ]);
    const target = new Map([
      ['main.tex', { text: 'Olá mundo novo.\n' }],
      ['cap/novo.tex', { text: 'Texto novo aqui.\n' }],
      ['fig.png', { hash: 'b' }],
      ['igual.tex', { text: 'x\n' }],
    ]);
    const { files, totals } = compareTrees(base, target);
    expect(files.map((file) => `${file.status} ${file.path}`)).toEqual([
      'added cap/novo.tex',
      'removed cap/velho.tex',
      'modified fig.png',
      'modified main.tex',
    ]);
    expect(totals).toEqual({ insertedWords: 4, deletedWords: 2, changedFiles: 4 });
  });
});

describe('texto do PDF', () => {
  it('desfaz hifenização e quebras de linha e põe uma frase por linha', () => {
    expect(normalizePdfText(['Comece a escrever aqui. Frase nova adi-\ncionada.\nOutra linha', '', 'Página dois.'])).toBe(
      'Comece a escrever aqui.\nFrase nova adicionada.\nOutra linha\n\nPágina dois.',
    );
  });

  it('reflow do parágrafo não aparece como alteração', () => {
    const before = normalizePdfText(['Os resultados indicam\numa melhora signifi-\ncativa.']);
    const after = normalizePdfText(['Os resultados indicam uma\nmelhora significativa.']);
    expect(diffStats(diffText(before, after))).toEqual({ insertedWords: 0, deletedWords: 0 });
  });
});
