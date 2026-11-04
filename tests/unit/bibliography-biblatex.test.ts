import { describe, expect, it } from 'vitest';
import { readBiblatexConfig } from '@/lib/latex/biblatex-config';
import { applySourcemaps, buildBiblatexBbl, parseName, parseNameList, scanBiblatex } from '@/lib/latex/bibliography-biblatex';
import { decodeLatex, plainText } from '@/lib/latex/latex-text';
import { md5Hex } from '@/lib/latex/md5';
import { buildCompileInput, missingFonts } from '@/lib/latex/prepare';

// As linhas esperadas abaixo vêm do Biber 2.19 rodado nas mesmas entradas
// (o formato 3.3 só acrescenta o quarto argumento de \entry e um /global no nome da lista).

const BIB = String.raw`@article{shoup2006cruising,
  author  = {Shoup, Donald C.},
  title   = {Cruising for Parking},
  journal = {Transport Policy},
  volume  = {13}, number = {6}, pages = {479--486}, year = {2006},
  doi     = {10.1016/j.tranpol.2006.05.005}
}
@article{almeida2015pklot,
  author  = {de Almeida, Paulo R. L. and Oliveira, Luiz S. and Britto Jr., Alceu S. and Silva Jr., Eunelson J. and Koerich, Alessandro L.},
  title   = {{PKLot} -- A robust dataset for parking lot classification},
  journal = {Expert Systems with Applications},
  volume  = {42}, number = {11}, pages = {4937--4949}, year = {2015}
}
@article{almeida2022review,
  author  = {de Almeida, Paulo R. L. and Alves, Jeovane Hon{\'o}rio and Parpinelli, Rafael Stubs and Barddal, Jean Paul},
  title   = {A Systematic Review on Computer Vision-Based Parking Lot Management Applied on Public Datasets},
  journal = {Expert Systems with Applications},
  volume  = {198}, pages = {116731}, year = {2022}
}
@book{goodfellow2016deep,
  author    = {Goodfellow, Ian and Bengio, Yoshua and Courville, Aaron},
  title     = {Deep Learning},
  publisher = {MIT Press}, address = {Cambridge, MA}, year = {2016},
  url       = {https://www.deeplearningbook.org}
}
@online{pgvector,
  author  = {{pgvector}},
  title   = {pgvector: Open-source vector similarity search for Postgres},
  url     = {https://github.com/pgvector/pgvector},
  urldate = {2026-10-16}
}
@misc{bge2023,
  author        = {Xiao, Shitao and Liu, Zheng and Zhang, Peitian and Muennighoff, Niklas},
  title         = {{C-Pack}: Packaged Resources To Advance General {Chinese} Embedding},
  year          = {2023},
  eprint        = {2309.07597},
  archivePrefix = {arXiv}
}
@article{harris2020numpy,
  author = {Harris, Charles R. and Millman, K. Jarrod and van der Walt, St{\'e}fan J. and others},
  title  = {Array programming with {NumPy}}, journal = {Nature}, year = {2020}
}
`;

function documentWith(options: string, citations: string): Map<string, string> {
  return new Map([
    ['main.tex', String.raw`\documentclass{article}
\input{configuracoes/includes}
\begin{document}
${citations}
\printbibliography
\end{document}`],
    ['configuracoes/includes.tex', String.raw`\usepackage[${options}]{biblatex}
\addbibresource{referencia.bib}`],
    ['referencia.bib', BIB],
  ]);
}

/** As opções que os estilos do biblatex definem (o .bbx e o .cbx de cada um, só a parte que muda o .bbl). */
const STYLES: Record<string, string> = {
  'authoryear.bbx': String.raw`\ExecuteBibliographyOptions{labeldateparts,sorting=nyt,pagetracker,mergedate}\RequireBibliographyStyle{standard}`,
  'authoryear.cbx': String.raw`\ExecuteBibliographyOptions{labeldateparts,uniquename,uniquelist,autocite=inline}`,
  'alphabetic.bbx': String.raw`\ExecuteBibliographyOptions{labelalpha,sorting=anyt}\RequireBibliographyStyle{standard}`,
  'alphabetic.cbx': String.raw`\ExecuteBibliographyOptions{labelalpha,autocite=inline}`,
};
const styleFile = (name: string) => STYLES[name] ?? null;

/** Linhas de uma entrada do .bbl, sem a indentação. */
function entry(bbl: string, key: string): string[] {
  const start = bbl.indexOf(`\\entry{${key}}`);
  const end = bbl.indexOf('\\endentry', start);
  return bbl.slice(start, end).split('\n').map((line) => line.trim()).filter(Boolean);
}

describe('textos do .bib', () => {
  it('decodifica acentos como o Biber', () => {
    expect(decodeLatex(String.raw`Aum{\"u}ller, Hon{\'o}rio, {\c{C}}a{\~a}o, Lo{\"\i}c, Lu{\'\i}s`)).toBe('Aumüller, Honório, Çaão, Loı̈c, Luís');
    expect(plainText(String.raw`{PKLot} -- \emph{A} St{\'e}fan~J.`)).toBe('PKLot -- A Stéfan J.');
  });

  it('calcula o MD5', () => {
    expect(md5Hex('')).toBe('d41d8cd98f00b204e9800998ecf8427e');
    expect(md5Hex('abc')).toBe('900150983cd24fb0d6963f7d28e17f72');
    expect(md5Hex('ShoupDonaldC')).toBe('93b11eac05d3b3829417970615ae292e');
  });
});

describe('nomes', () => {
  it('separa as partes nas três formas do BibTeX', () => {
    expect(parseName('de Almeida, Paulo R. L.')).toEqual({ prefix: ['de'], family: ['Almeida'], given: ['Paulo', 'R.', 'L.'], suffix: [] });
    expect(parseName('Ludwig van Beethoven')).toEqual({ prefix: ['van'], family: ['Beethoven'], given: ['Ludwig'], suffix: [] });
    expect(parseName('Jean de la Fontaine')).toEqual({ prefix: ['de', 'la'], family: ['Fontaine'], given: ['Jean'], suffix: [] });
    expect(parseName('Doe, Jr., John')).toEqual({ prefix: [], family: ['Doe'], given: ['John'], suffix: ['Jr.'] });
    expect(parseName('{World Health Organization}').family).toEqual(['{World Health Organization}']);
    expect(parseNameList('A, B and C, D and others')).toMatchObject({ more: true, names: [{ family: ['A'] }, { family: ['C'] }] });
  });

  it('escreve partes, iniciais e hashes como o Biber', () => {
    const bbl = buildBiblatexBbl(documentWith('style=numeric,sorting=none,maxbibnames=10', String.raw`\cite{almeida2015pklot}`), 'main.tex')!.bbl;
    const lines = entry(bbl, 'almeida2015pklot');
    expect(lines).toContain('{{hash=9e81777bd74ee87f0a35f63bfc05963a}{%');
    expect(lines).toContain('given={Paulo\\bibnamedelimb R.\\bibnamedelimi L.},');
    expect(lines).toContain('giveni={P\\bibinitperiod\\bibinitdelim R\\bibinitperiod\\bibinitdelim L\\bibinitperiod},');
    expect(lines).toContain('family={Britto\\bibnamedelima Jr.},');
    expect(lines).toContain('\\strng{namehash}{886b51b1d7f1e8f99a41bf8ebea4c982}');
    expect(lines).toContain('\\strng{fullhash}{7f4a81f0c488f0785beb0acb5ec5aebd}');
  });
});

describe('.bbl do biblatex', () => {
  it('monta o cabeçalho e as listas no formato 3.3', () => {
    const bbl = buildBiblatexBbl(documentWith('style=numeric,sorting=none', String.raw`\cite{shoup2006cruising}`), 'main.tex')!.bbl;
    expect(bbl).toContain('% $ biblatex bbl format version 3.3 $');
    expect(bbl).toContain('\\datalist[entry]{none/global//global/global/global}');
    expect(entry(bbl, 'shoup2006cruising')).toEqual([
      '\\entry{shoup2006cruising}{article}{}{}',
      '\\name{author}{1}{}{%',
      '{{hash=93b11eac05d3b3829417970615ae292e}{%',
      'family={Shoup},',
      'familyi={S\\bibinitperiod},',
      'given={Donald\\bibnamedelima C.},',
      'giveni={D\\bibinitperiod\\bibinitdelim C\\bibinitperiod}}}%',
      '}',
      '\\strng{namehash}{93b11eac05d3b3829417970615ae292e}',
      '\\strng{fullhash}{93b11eac05d3b3829417970615ae292e}',
      '\\strng{bibnamehash}{93b11eac05d3b3829417970615ae292e}',
      '\\strng{authorbibnamehash}{93b11eac05d3b3829417970615ae292e}',
      '\\strng{authornamehash}{93b11eac05d3b3829417970615ae292e}',
      '\\strng{authorfullhash}{93b11eac05d3b3829417970615ae292e}',
      '\\field{sortinit}{1}',
      `\\field{sortinithash}{${md5Hex('1')}}`,
      '\\field{labelnamesource}{author}',
      '\\field{labeltitlesource}{title}',
      '\\field{journaltitle}{Transport Policy}',
      '\\field{number}{6}',
      '\\field{title}{Cruising for Parking}',
      '\\field{volume}{13}',
      '\\field{year}{2006}',
      '\\field{pages}{479\\bibrangedash 486}',
      '\\range{pages}{8}',
      '\\verb{doi}',
      '\\verb 10.1016/j.tranpol.2006.05.005',
      '\\endverb',
    ]);
  });

  it('aplica os mapas do Biber: journal, address, archivePrefix e urldate', () => {
    const bbl = buildBiblatexBbl(documentWith('style=numeric', String.raw`\cite{goodfellow2016deep,bge2023,pgvector}`), 'main.tex')!.bbl;
    expect(entry(bbl, 'goodfellow2016deep')).toEqual(expect.arrayContaining(['\\list{location}{1}{%', '{Cambridge, MA}%', '\\verb{urlraw}', '\\verb https://www.deeplearningbook.org']));
    expect(entry(bbl, 'bge2023')).toEqual(expect.arrayContaining(['\\field{eprinttype}{arXiv}', '\\verb{eprint}', '\\verb 2309.07597']));
    expect(entry(bbl, 'pgvector')).toEqual(
      expect.arrayContaining(['family={{pgvector}},', '\\field{urlday}{16}', '\\field{urlmonth}{10}', '\\field{urlyear}{2026}', '\\field{urldateera}{ce}']),
    );
  });

  it('ordena por nome (nty) e numera autores repetidos (extraname)', () => {
    const bbl = buildBiblatexBbl(documentWith('style=numeric', String.raw`\cite{shoup2006cruising,almeida2015pklot,almeida2022review,goodfellow2016deep}`), 'main.tex')!.bbl;
    const order = [...bbl.matchAll(/\\entry\{([^}]+)\}/g)].map((match) => match[1]);
    expect(order).toEqual(['almeida2022review', 'almeida2015pklot', 'goodfellow2016deep', 'shoup2006cruising']);
    expect(entry(bbl, 'almeida2022review')).toContain('\\field{extraname}{1}');
    expect(entry(bbl, 'almeida2015pklot')).toContain('\\field{extraname}{2}');
  });

  it('no authoryear, separa listas com uniquelist e marca uniquename e a data do rótulo', () => {
    const bbl = buildBiblatexBbl(documentWith('style=authoryear', String.raw`\textcite{almeida2015pklot} e \parencite[p.~3]{almeida2022review}`), 'main.tex', styleFile)!.bbl;
    expect(bbl).toContain('\\datalist[entry]{nyt/global//global/global/global}');
    const lines = entry(bbl, 'almeida2022review');
    expect(lines).toContain('\\name{author}{4}{ul=2}{%');
    expect(lines).toContain('{{un=0,uniquepart=base,hash=9e81777bd74ee87f0a35f63bfc05963a}{%');
    expect(lines).toContain('\\strng{namehash}{e3a765641fc10b84f8999ff9d12e88ce}');
    expect(lines).toEqual(expect.arrayContaining(['\\field{extradatescope}{labelyear}', '\\field{labeldatesource}{}']));
  });

  it('monta o labelalpha do alphabetic, com + para "and others"', () => {
    const bbl = buildBiblatexBbl(documentWith('style=alphabetic', String.raw`\cite{harris2020numpy,goodfellow2016deep,shoup2006cruising}`), 'main.tex', styleFile)!.bbl;
    expect(entry(bbl, 'harris2020numpy')).toEqual(expect.arrayContaining(['\\field{labelalpha}{HMW+20}', '\\true{moreauthor}', '\\true{morelabelname}']));
    expect(entry(bbl, 'goodfellow2016deep')).toContain('\\field{labelalpha}{GBC16}');
    expect(entry(bbl, 'shoup2006cruising')).toContain('\\field{labelalpha}{Sho06}');
  });

  it('lê as opções padrão do estilo (abnt.bbx e o authoryear-comp.cbx que ele pede)', () => {
    const files: Record<string, string> = {
      'abnt.bbx': String.raw`\ExecuteBibliographyOptions{%
  uniquename=false,% comentário
  sorting=nty,%
}
\RequireBibliographyStyle{standard}`,
      'abnt.cbx': String.raw`\ExecuteBibliographyOptions{uniquename=minfull}\RequireCitationStyle{authoryear-comp}`,
      'authoryear-comp.cbx': String.raw`\ExecuteBibliographyOptions{labeldateparts,uniquename,uniquelist,sortcites}`,
    };
    const config = readBiblatexConfig({ packageOptions: 'style=abnt', preamble: '', styleFile: (name) => files[name] ?? null });
    expect(config.options).toMatchObject({ sorting: 'nty', uniquename: 'minfull', uniquelist: 'true', labeldateparts: true });
  });

  it('acha citações de todos os comandos e as que faltam no .bib', () => {
    const texts = documentWith(
      'style=numeric',
      String.raw`\parencites(Ver)()[p.~1]{shoup2006cruising}[cap.~2]{pgvector} \Textcite{bge2023} \footcite{naoexiste} \nocite{goodfellow2016deep}`,
    );
    const scanned = scanBiblatex(texts, 'main.tex')!;
    expect(scanned.sections[0]!.map((record) => record.key)).toEqual(['shoup2006cruising', 'pgvector', 'bge2023', 'naoexiste', 'goodfellow2016deep']);
    expect(scanned.resources).toEqual(['referencia.bib']);
    const result = buildBiblatexBbl(texts, 'main.tex')!;
    expect(result.missing).toEqual(['naoexiste']);
    expect(result.bbl).toContain('\\missing{naoexiste}');
  });

  it('herda campos do crossref com as regras do biblatex', () => {
    const raw = applySourcemaps({ key: 'x', type: 'phdthesis', fields: new Map([['school', 'MIT'], ['journal', 'J']]) }, readBiblatexConfig({ packageOptions: '', preamble: '', styleFile: () => null }).sourcemaps);
    expect(raw.type).toBe('thesis');
    expect(Object.fromEntries(raw.fields)).toEqual({ institution: 'MIT', journaltitle: 'J', type: 'phdthesis' });
    const texts = new Map([
      ['main.tex', String.raw`\documentclass{article}\usepackage{biblatex}\addbibresource{r.bib}\begin{document}\cite{cap}\end{document}`],
      ['r.bib', String.raw`@book{livro, author = {Escritor, Ana}, title = {O Livro}, subtitle = {Sub}, year = {2000}}
@inbook{cap, author = {Autora, Bia}, crossref = {livro}, pages = {5}}`],
    ]);
    const lines = entry(buildBiblatexBbl(texts, 'main.tex')!.bbl, 'cap');
    expect(lines).toEqual(expect.arrayContaining(['\\name{bookauthor}{1}{}{%', '\\field{booktitle}{O Livro}', '\\field{booksubtitle}{Sub}', '\\field{year}{2000}']));
    expect(lines.join('\n')).not.toContain('\\field{title}');
  });
});

describe('compilação com biblatex', () => {
  it('pede os estilos soltos e deixa o .bbl para quando eles chegarem', () => {
    const texts = [...documentWith('style=abnt', String.raw`\cite{shoup2006cruising}`)].map(([path, content]) => ({ path, content }));
    const input = buildCompileInput('main.tex', texts, new Map());
    expect(input.texliveFiles).toEqual(['abnt.bbx', 'abnt.cbx']);
    expect(input.texlivePackages).toContain('biblatex');
    expect(input.additionalFiles['document.bbl']).toBeUndefined();
    const bbl = input.biblatexBbl!(() => null);
    expect(bbl?.bbl).toContain('\\entry{shoup2006cruising}{article}{}{}');
  });

  it('acha as fontes que faltaram no log', () => {
    expect(
      missingFonts([
        '! Font OT1/ptm/m/n/10=ptmr7t at 10.0pt not loadable: Metric (TFM) file not found.',
        '!pdfTeX error: pdflatex (file utmr8a.pfb): cannot open Type 1 font file for reading',
      ]),
    ).toEqual(['ptmr7t', 'utmr8a']);
  });
});
