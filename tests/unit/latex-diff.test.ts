import { describe, expect, it } from 'vitest';
import { buildDiffDocument, flattenLatex, segmentUnits, splitDocument, stripComments, tokenizeUnit } from '@/lib/diff/latex-diff';

const doc = (body: string, preamble = '\\documentclass{article}\n') => `${preamble}\\begin{document}\n${body}\n\\end{document}\n`;

/** Chaves balanceadas, ignorando as escapadas. */
const balanced = (text: string) => {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\\') i++;
    else if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth < 0) return false;
  }
  return depth === 0;
};

describe('preparação do diff visual', () => {
  it('tira comentários sem tocar no \\%', () => {
    expect(stripComments('a 10\\% b % comentário\nc')).toBe('a 10\\% b \nc');
  });

  it('achata \\input e \\include, sem ciclo', () => {
    const tree = new Map([
      ['tese/main.tex', doc('\\input{cap/um}\n\\include{cap/dois.tex}')],
      ['tese/cap/um.tex', 'Um. \\input{../main}'],
      ['tese/cap/dois.tex', 'Dois.'],
    ]);
    const flat = flattenLatex(tree, 'tese/main.tex');
    expect(flat).toContain('Um.');
    expect(flat).toContain('\\clearpage\nDois.');
    expect(splitDocument(flat)).not.toBeNull();
  });

  it('divide o corpo só fora de ambientes e chaves', () => {
    const units = segmentUnits('Primeiro.\n\n\\begin{itemize}\n\\item a\n\n\\item b\n\\end{itemize}\n\nÚltimo {com\n\nchave}.');
    expect(units).toEqual(['Primeiro.', '\\begin{itemize}\n\\item a\n\n\\item b\n\\end{itemize}', 'Último {com\n\nchave}.']);
  });

  it('comandos, grupos e matemática viram átomos; ambiente impede o diff por palavra', () => {
    const tokens = tokenizeUnit('Veja \\cite[p. 2]{silva} e $x^2$ {\\bf negrito}.')!;
    expect(tokens.filter((token) => token.kind === 'atom').map((token) => token.text)).toEqual(['\\cite[p. 2]{silva}', '$x^2$', '{\\bf negrito}']);
    expect(tokenizeUnit('\\begin{center}x\\end{center}')).toBeNull();
  });
});

describe('LaTeX anotado', () => {
  it('marca palavras inseridas e removidas com macros balanceadas', () => {
    const before = doc('\\section{Resultados}\nOs resultados indicam melhora.\n\nParágrafo igual.');
    const after = doc('\\section{Resultados}\nOs resultados indicam uma melhora significativa \\cite{silva}.\n\nParágrafo igual.');
    const result = buildDiffDocument(before, after, 'word')!;
    expect(result.source).toContain('\\DIFadd{uma}');
    expect(result.source).toContain('\\DIFaddatom{\\cite{silva}}');
    expect(result.source).toContain('Parágrafo igual.');
    expect(result.source).toContain('\\DIFmark{1}');
    expect(result.stats.insertedWords).toBe(2);
    expect(balanced(splitDocument(result.source)!.body)).toBe(true);
  });

  it('neutraliza o que foi removido: rótulo sai, seção e figura viram aviso', () => {
    const before = doc('Fica.\n\n\\section{Antiga}\\label{sec:antiga}\nTexto antigo que saiu inteiro daqui.\n\n\\begin{figure}\\includegraphics{a.png}\\caption{Arquitetura}\\label{fig:a}\\end{figure}');
    const after = doc('Fica.');
    const result = buildDiffDocument(before, after, 'word')!;
    const body = splitDocument(result.source)!.body;
    expect(body).not.toContain('\\label');
    expect(body).toContain('\\DIFdelsection{Antiga}');
    expect(body).toContain('\\DIFdelfloat{Arquitetura}');
    expect(body).not.toContain('\\includegraphics');
    expect(result.changes.every((change) => change.kind === 'del')).toBe(true);
  });

  it('bloco com ambiente entra inteiro em DIFaddenv; no nível paragraph não usa ulem', () => {
    const result = buildDiffDocument(doc('A.'), doc('A.\n\n\\begin{itemize}\n\\item novo\n\\end{itemize}'), 'paragraph')!;
    expect(result.source).toContain('\\begin{DIFaddenv}\\DIFmark{1}\n\\begin{itemize}');
    expect(result.source).not.toContain('ulem');
  });

  it('sem \\begin{document} não há diff visual', () => {
    expect(buildDiffDocument('texto solto', doc('x'), 'word')).toBeNull();
  });
});

describe('diff dentro de argumentos', () => {
  it('marca só a palavra alterada dentro de \\emph e de \\section, sem \\DIFmark no argumento', () => {
    const before = doc('\\section{Resultados preliminares}\nTexto com \\emph{ênfase antiga} aqui e \\footnote{nota um}.');
    const after = doc('\\section{Resultados finais}\nTexto com \\emph{ênfase nova} aqui e \\footnote{nota um}.');
    const body = splitDocument(buildDiffDocument(before, after, 'word')!.source)!.body;
    expect(body).toContain('\\section{Resultados \\DIFdel{preliminares}\\DIFadd{finais}}');
    expect(body).toContain('\\emph{ênfase \\DIFdel{antiga}\\DIFadd{nova}}');
    expect(body).toContain('\\footnote{nota um}');
    expect(body).not.toMatch(/\\section\{[^}]*\\DIFmark/);
    expect(balanced(body)).toBe(true);
  });

  it('comando diferente continua sendo trocado inteiro', () => {
    const body = splitDocument(buildDiffDocument(doc('Um \\emph{termo} só.'), doc('Um \\textbf{termo} só.'), 'word')!.source)!.body;
    expect(body).toContain('\\DIFdelatom{\\emph{termo}}');
    expect(body).toContain('\\DIFaddatom{\\textbf{termo}}');
  });
});
