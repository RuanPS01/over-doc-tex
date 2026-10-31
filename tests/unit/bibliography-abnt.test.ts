import { describe, expect, it } from 'vitest';
import { initials, people } from '@/lib/latex/bib-names';
import { changeCase, sortify } from '@/lib/latex/bibliography-abnt';
import { buildBbl, scanCitations } from '@/lib/latex/bibliography';

const BIB = String.raw`@article{silva2020,
  author = {Silva, Ana and Souza, Bruno},
  title = {Revisão de Código Aplicada a Textos Acadêmicos},
  journal = {Revista Brasileira de Informática na Educação},
  year = 2020, volume = {28}, number = 3, pages = {10-25}, month = mar
}
@inproceedings{abc2021,
  author = {Alves, Carla and Barros, Davi and Costa, Elisa and Dias, Fábio},
  title = {{BERT}: Pull Requests para Teses},
  booktitle = {Anais do SBIE}, pages = {1--10}, year = {2021}
}
@mastersthesis{araujo2012,
  Address = {Bras{\'\i}lia},
  Author = {Lauro C{\'e}sar Araujo},
  Month = {mar.},
  School = {Universidade de Bras{\'\i}lia},
  Subtitle = {uma perspectiva de {A}rquitetura da {I}nforma{\c c}{\~a}o},
  Title = {Configura{\c c}{\~a}o},
  Year = {2012}}
@manual{brasil2018,
  Author = {{BRASIL}},
  Title = {Lei n. 13.709, de 14 de agosto de 2018},
  Organization = {Di{\'a}rio Oficial da Uni{\~a}o},
  Address = {Bras{\'\i}lia}, Year = {2018}}
@misc{wiki2015,
  Author = {Lauro C{\'e}sar Araujo},
  Howpublished = {Wiki do abnTeX2},
  Title = {Como customizar o abnTeX2},
  Url = {https://github.com/abntex/abntex2/wiki/ComoCustomizar},
  Urlaccessdate = {27 abr. 2015},
  Year = {2015}}
@book{souza2020a, author = {Bruno Souza}, title = {Primeiro}, publisher = {Ed. A}, address = {Recife}, year = 2020}
@book{souza2020b, author = {Bruno Souza}, title = {Segundo}, year = 2020}
`;

const main = (preamble: string, body: string) => `\\documentclass{abntex2}\n${preamble}\n\\begin{document}\n${body}\n\\bibliography{refs}\n\\end{document}`;

const bblOf = (preamble: string, body: string) => buildBbl(new Map([['main.tex', main(preamble, body)], ['refs.bib', BIB]]), 'main.tex')!;

describe('nomes do BibTeX', () => {
  it('iniciais com acento, hífen e til, como o {f.} do bibtex', () => {
    expect(initials('Lauro C{\\\'e}sar')).toBe('L.~C.');
    expect(initials('Wen-tau')).toBe('W.-t.');
    expect(initials("{\\'E}rica Maria")).toBe("{\\'E}.~M.");
  });

  it('" and " entre chaves não separa pessoas', () => {
    expect(people('{Barnes and Noble} and Ana Silva').map((person) => person.last)).toEqual(['{Barnes and Noble}', 'Silva']);
  });
});

describe('caixa e ordenação (change.case$ e purify$)', () => {
  it('maiúsculas mudam caracteres especiais e preservam grupos protegidos', () => {
    expect(changeCase('K{\\"u}ttler', 'upper')).toBe('K{\\"U}TTLER');
    expect(changeCase('{BRASIL} e {iPhone}', 'upper')).toBe('{BRASIL} E {iPhone}');
    expect(changeCase('Lo{\\"\\i}c', 'upper')).toBe('LO{\\"I}C');
  });

  it('modo título: primeira letra e a que vem depois de ": " ficam', () => {
    expect(changeCase('{BERT}: Pre-Training of Deep Models', 'title')).toBe('{BERT}: Pre-training of deep models');
    expect(changeCase('Análise De Dados: Um Estudo', 'title')).toBe('Análise de dados: Um estudo');
  });

  it('ordena sem comandos, acentos e pontuação', () => {
    expect(sortify("{\\'A}lvares, J.~da")).toBe('alvares j da');
  });
});

describe('estilo ABNT (abntex2cite)', () => {
  it('modo alf: \\abntrefinfo, ordem alfabética e referência no formato da NBR 6023', () => {
    const { bbl, missing } = bblOf('\\usepackage[alf]{abntex2cite}', '\\cite{silva2020} \\citeonline{abc2021} \\cite{araujo2012}');
    expect(missing).toEqual([]);
    expect(bbl).toContain('\\setlength{\\labelsep}{0pt}\\begin{thebibliography}{}');
    expect(bbl).toContain('\\bibitem[Silva e Souza 2020]{silva2020}\n\\abntrefinfo{Silva e Souza}{SILVA; SOUZA}{2020}');
    expect(bbl).toContain(
      '{SILVA, A.; SOUZA, B. Revisão de código aplicada a textos acadêmicos.\n\\emph{Revista Brasileira de Informática na Educação}, v.~28, n.~3, p. 10--25, mar. 2020.}',
    );
    // Mais de 3 autores: "et al." na referência e na citação.
    expect(bbl).toContain('\\abntrefinfo{Alves et al.}{ALVES et al.}{2021}');
    expect(bbl).toContain('{ALVES, C. et al. {BERT}: Pull requests para teses. In: \\emph{Anais do SBIE}. [S.l.: s.n.], 2021. p. 1--10.}');
    expect(bbl.indexOf('{abc2021}')).toBeLessThan(bbl.indexOf('{araujo2012}'));
    expect(bbl.indexOf('{araujo2012}')).toBeLessThan(bbl.indexOf('{silva2020}'));
  });

  it('dissertação, manual com autor institucional e página com acesso', () => {
    const { bbl } = bblOf('\\usepackage[alf]{abntex2cite}', '\\cite{araujo2012,brasil2018,wiki2015}');
    expect(bbl).toContain(
      "{ARAUJO, L.~C.\n\\emph{Configura{\\c c}{\\~a}o}: uma perspectiva de {A}rquitetura da {I}nforma{\\c c}{\\~a}o.\nDisserta\\c{c}\\~{a}o (Mestrado) --- Universidade de Bras{\\'\\i}lia, Bras{\\'\\i}lia, mar. 2012.}",
    );
    expect(bbl).toContain('\\abntrefinfo{{BRASIL}}{{BRASIL}}{2018}');
    expect(bbl).toContain("{{BRASIL}. \\emph{Lei n. 13.709, de 14 de agosto de 2018}.\nBras{\\'\\i}lia, 2018.}");
    expect(bbl).toContain(
      "{ARAUJO, L.~C. \\emph{Como customizar o abnTeX2}. 2015. Wiki do abnTeX2.\nDispon{\\'\\i}vel em: \\url{https://github.com/abntex/abntex2/wiki/ComoCustomizar}. Acesso em: 27 abr. 2015.}",
    );
  });

  it('mesmo autor e ano ganham 2020a e 2020b', () => {
    const { bbl } = bblOf('\\usepackage[alf]{abntex2cite}', '\\cite{souza2020b,souza2020a}');
    expect(bbl).toContain('\\abntrefinfo{Souza}{SOUZA}{2020a}');
    expect(bbl).toContain('\\abntrefinfo{Souza}{SOUZA}{2020b}');
    expect(bbl).toContain('{SOUZA, B. \\emph{Primeiro}. Recife: Ed. A, 2020.}');
    expect(bbl).toContain('{SOUZA, B. \\emph{Segundo}. [S.l.: s.n.], 2020.}');
  });

  it('modo num (padrão do abntex2cite): ordem de citação, sem rótulo', () => {
    const { bbl } = bblOf('\\usepackage{abntex2cite}', '\\cite{silva2020} \\cite{abc2021}');
    expect(bbl).toContain('\\begin{thebibliography}{}');
    expect(bbl).not.toContain('\\setlength{\\labelsep}');
    expect(bbl).toContain('\\bibitem{silva2020}');
    expect(bbl.indexOf('{silva2020}')).toBeLessThan(bbl.indexOf('{abc2021}'));
  });

  it('\\citeoption muda o estilo e não conta como citação; \\apud cita as duas obras', () => {
    const info = scanCitations('\\usepackage[alf,abnt-etal-cite=2]{abntex2cite} \\citeoption{abnt-emphasize=bf} \\apud[p. 3]{silva2020}{araujo2012}');
    expect(info.keys).toEqual(['silva2020', 'araujo2012']);
    expect(info.abntex2cite).toEqual(['alf', 'abnt-etal-cite=2']);
    expect(info.citeOptions).toEqual(['abnt-emphasize=bf']);
    const { bbl, missing } = bblOf('\\usepackage[alf]{abntex2cite}', '\\citeoption{abnt-emphasize=bf}\\cite{araujo2012}');
    expect(missing).toEqual([]);
    expect(bbl).toContain('\\textbf{Configura{\\c c}{\\~a}o}');
  });
});
