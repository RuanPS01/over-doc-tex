import { describe, expect, it } from 'vitest';
import { buildBbl, parseBibFile, scanCitations } from '@/lib/latex/bibliography';
import { buildCompileInput } from '@/lib/latex/prepare';

const BIB = String.raw`@string{rbie = {Revista Brasileira de Informática na Educação}}
@article{silva2020,
  author = {Silva, Ana and Souza, Bruno},
  title = {Revisão de código aplicada a textos acadêmicos},
  journal = rbie,
  year = 2020, volume = {28}, number = 3, pages = {10-25},
  doi = {10.5753/rbie.2020}
}
@book{knuth1984,
  author = {Donald E. Knuth},
  title = {The {\TeX}book},
  publisher = {Addison-Wesley}, address = {Reading, MA}, year = {1984}
}
@inproceedings{abc2021,
  author = {Alves, Carla and Barros, Davi and Costa, Elisa and Dias, Fábio},
  title = {Pull requests para teses},
  booktitle = {Anais do SBIE}, pages = {1--10}, year = {2021}
}
@misc{naocitado, title = {Fora da lista}, year = {1999}}
`;

const MAIN = String.raw`\documentclass{article}
\begin{document}
\input{cap/um}
Ver \cite[p.~3]{knuth1984}.
\bibliographystyle{plain}
\bibliography{refs}
\end{document}`;

describe('BibTeX no navegador', () => {
  it('lê @string, concatenação, números e chaves', () => {
    const [entry] = parseBibFile(BIB);
    expect(entry!.fields.get('journal')).toBe('Revista Brasileira de Informática na Educação');
    expect(entry!.fields.get('number')).toBe('3');
    expect(parseBibFile(BIB)[1]!.fields.get('title')).toBe('The {\\TeX}book');
  });

  it('acha citações em ordem, bancos e estilo', () => {
    const info = scanCitations('\\cite{b,a} \\citep[cap. 2]{c} \\nocite{a} \\citeonline{d}\\bibliographystyle{unsrt}\\bibliography{x,y}');
    expect(info).toEqual({ keys: ['b', 'a', 'c', 'd'], databases: ['x', 'y'], style: 'unsrt', usesNatbib: false });
  });

  it('monta o .bbl do plain: ordenado por autor, numérico, com as citações dos \\input', () => {
    const texts = new Map([
      ['main.tex', MAIN],
      ['cap/um.tex', 'Segundo \\cite{silva2020} e \\cite{fantasma}.'],
      ['refs.bib', BIB],
    ]);
    const result = buildBbl(texts, 'main.tex')!;
    expect(result.missing).toEqual(['fantasma']);
    expect(result.bbl).toContain('\\begin{thebibliography}{2}');
    expect(result.bbl.indexOf('\\bibitem{knuth1984}')).toBeLessThan(result.bbl.indexOf('\\bibitem{silva2020}'));
    expect(result.bbl).toContain('Ana Silva and Bruno Souza.');
    expect(result.bbl).toContain('\\emph{Revista Brasileira de Informática na Educação}, 28(3):10--25, 2020.');
    expect(result.bbl).toContain('\\url{https://doi.org/10.5753/rbie.2020}');
    expect(result.bbl).not.toContain('naocitado');
  });

  it('alpha gera rótulos; natbib gera autor-ano; abbrv abrevia nomes; unsrt mantém a ordem', () => {
    const texts = (style: string, extra = '') =>
      new Map([['main.tex', `\\documentclass{article}${extra}\\begin{document}\\cite{silva2020,abc2021}\\bibliographystyle{${style}}\\bibliography{refs}\\end{document}`], ['refs.bib', BIB]]);
    expect(buildBbl(texts('alpha'), 'main.tex')!.bbl).toContain('\\bibitem[ABC{\\etalchar{+}}21]{abc2021}');
    expect(buildBbl(texts('plainnat', '\\usepackage{natbib}'), 'main.tex')!.bbl).toContain('\\bibitem[Silva and Souza(2020)Silva and Souza]{silva2020}');
    expect(buildBbl(texts('abbrv'), 'main.tex')!.bbl).toContain('A.~Silva and B.~Souza.');
    const unsorted = buildBbl(texts('unsrt'), 'main.tex')!.bbl;
    expect(unsorted.indexOf('{silva2020}')).toBeLessThan(unsorted.indexOf('{abc2021}'));
  });

  it('sem \\bibliography não há .bbl; com, ele vai para o compilador como document.bbl', () => {
    expect(buildBbl(new Map([['main.tex', '\\documentclass{article}\\begin{document}\\cite{a}\\end{document}']]), 'main.tex')).toBeNull();
    const input = buildCompileInput('main.tex', [{ path: 'main.tex', content: MAIN }, { path: 'cap/um.tex', content: '\\cite{silva2020}' }, { path: 'refs.bib', content: BIB }], new Map());
    expect(String(input.additionalFiles['document.bbl'])).toContain('\\bibitem{silva2020}');
  });
});
