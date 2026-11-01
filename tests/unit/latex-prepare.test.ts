import { describe, expect, it } from 'vitest';
import {
  adaptBabel,
  babelLanguagePackages,
  mainLineOffset,
  buildCompileInput,
  hasDocumentClass,
  parseTexLog,
  pickMainFile,
  relativeToMain,
  withBackrefFromAux,
} from '@/lib/latex/prepare';

const tex = (path: string, content: string) => ({ path, content });

describe('arquivo principal', () => {
  it('ignora \\documentclass comentado', () => {
    expect(hasDocumentClass('% \\documentclass{article}\nTexto')).toBe(false);
    expect(hasDocumentClass('\\documentclass[12pt]{article}')).toBe(true);
  });

  it('prefere o arquivo aberto, depois main.tex, depois o caminho mais curto', () => {
    const files = [
      tex('cap/um.tex', '\\section{Um}'),
      tex('tese/principal.tex', '\\documentclass{abntex2}'),
      tex('main.tex', '\\documentclass{article}'),
      tex('outro.tex', '\\documentclass{beamer}'),
    ];
    expect(pickMainFile(files, 'outro.tex')).toBe('outro.tex');
    expect(pickMainFile(files, 'cap/um.tex')).toBe('main.tex');
    expect(pickMainFile(files.filter((file) => file.path !== 'main.tex'))).toBe('outro.tex');
    expect(pickMainFile([tex('cap/um.tex', 'x')])).toBeNull();
  });
});

describe('babel', () => {
  it('troca brazil por brazilian e acrescenta provide=*', () => {
    expect(adaptBabel('\\usepackage[brazil]{babel}')).toBe('\\usepackage[provide=*,brazilian]{babel}');
    expect(adaptBabel('\\usepackage[english, portuges]{babel}')).toBe('\\usepackage[provide=*,english,portuguese]{babel}');
  });

  it('não mexe em babel sem português nem em quem já usa provide', () => {
    expect(adaptBabel('\\usepackage[english]{babel}')).toBe('\\usepackage[english]{babel}');
    expect(adaptBabel('\\usepackage[provide+=*,brazilian]{babel}')).toBe('\\usepackage[provide+=*,brazilian]{babel}');
  });
});

describe('idiomas e backref', () => {
  it('pede o .ldf dos idiomas da classe, do babel e o idioma fixo do abnTeX2', () => {
    const abntex2 = '\\documentclass[12pt, english, french, spanish, brazilian]{abntex2}';
    expect(babelLanguagePackages(abntex2)).toEqual(['babel-french', 'babel-spanish', 'babel-portuges']);
    expect(babelLanguagePackages('\\documentclass{abntex2}')).toEqual(['babel-portuges']);
    expect(babelLanguagePackages('\\documentclass{article}\n\\usepackage[english]{babel}')).toEqual([]);
    expect(babelLanguagePackages('\\documentclass{article}\n% \\usepackage[french]{babel}')).toEqual([]);
  });

  it('refaz o .brf do backref na mesma linha do \\begin{document}', () => {
    const source = '\\documentclass{abntex2}\n\\usepackage[brazilian,hyperpageref]{backref}\n\\begin{document}\nOi\n\\end{document}';
    const adapted = withBackrefFromAux(source);
    expect(adapted.split('\n')).toHaveLength(source.split('\n').length);
    expect(adapted.split('\n')[2]).toMatch(/^\\ExplSyntaxOn .*\\AddToHook\{begindocument\/before\}.*\\ExplSyntaxOff\\begin\{document\}$/);
    expect(withBackrefFromAux('\\documentclass{article}\n\\begin{document}\nbackref\n\\end{document}')).not.toContain('ExplSyntaxOn');
  });
});

describe('entrada do compilador', () => {
  it('monta os caminhos a partir da pasta do arquivo principal', () => {
    expect(relativeToMain('tese/cap/um.tex', 'tese/main.tex')).toBe('cap/um.tex');
    expect(relativeToMain('figuras/a.png', 'main.tex')).toBe('figuras/a.png');
    const input = buildCompileInput(
      'main.tex',
      [tex('main.tex', '\\documentclass{article}\\usepackage[brazil]{babel}'), tex('cap/um.tex', 'Um')],
      new Map([['figuras/a.png', new Uint8Array([1, 2])]]),
    );
    expect(input.source).toContain('provide=*,brazilian');
    expect(Object.keys(input.additionalFiles).sort()).toEqual(['cap/um.tex', 'figuras/a.png']);
  });

  it('lista os pacotes cujos arquivos soltos vão junto: idiomas e pacotes pedidos no projeto', () => {
    const input = buildCompileInput(
      'main.tex',
      [tex('main.tex', '\\documentclass[french]{abntex2}\n\\input{preambulo}'), tex('preambulo.tex', '\\usepackage{datatool,lastpage}\n% \\usepackage{comentado}')],
      new Map(),
    );
    expect(input.texlivePackages).toEqual(['babel-french', 'babel-portuges', 'datatool', 'lastpage']);
  });
});

describe('log do TeX', () => {
  it('acha erro com arquivo e linha', () => {
    const lines = [
      '(/document.tex',
      '(/texlive/texmf-dist/tex/latex/base/article.cls)',
      '(./cap/um.tex',
      '! Undefined control sequence.',
      'l.7 \\comandoinexistente',
      ')',
    ];
    expect(parseTexLog(lines, 'main.tex')).toEqual([
      { kind: 'error', message: 'Undefined control sequence.', file: 'cap/um.tex', line: 7 },
    ]);
  });

  it('mostra cada problema uma vez, mesmo com várias passagens do TeX', () => {
    const pass = ['(/document.tex', '! Undefined control sequence.', 'l.4 \\x', ')'];
    expect(parseTexLog([...pass, ...pass], 'main.tex')).toHaveLength(1);
  });

  it('volta ao principal depois que o arquivo incluído fecha', () => {
    const lines = ['(/document.tex', '(./cap/um.tex (/texlive/texmf-dist/tex/latex/x/y.sty))', '(babel) aviso qualquer', '! Undefined control sequence.', 'l.20 \\depois'];
    expect(parseTexLog(lines, 'main.tex')[0]).toMatchObject({ file: 'main.tex', line: 20 });
  });

  it('erro dentro de pacote aponta o arquivo do projeto, sem a linha do pacote', () => {
    const lines = ['(/document.tex', '(/texlive/texmf-dist/tex/latex/x/y.sty', '! Package x Error: opção inválida.', 'l.99 \\algo'];
    expect(parseTexLog(lines, 'main.tex')[0]).toMatchObject({ file: 'main.tex', line: null, message: 'opção inválida.' });
  });

  it('corrige a linha do principal quando o Siglum entrega só o corpo ao TeX', () => {
    const source = 'linha1\nlinha2\n\\begin{document}\nTexto\n\\erro\n';
    expect(mainLineOffset(source, ['Using custom format'])).toBe(2);
    expect(mainLineOffset(source, ['Injecting microtype expansion=false workaround'])).toBe(-2);
    expect(mainLineOffset(source, [])).toBe(0);
    const lines = ['(/document.tex', '! Undefined control sequence.', 'l.3 \\erro'];
    expect(parseTexLog(lines, 'main.tex', 2)[0]).toMatchObject({ file: 'main.tex', line: 5 });
    // Arquivos de \input chegam inteiros ao TeX: sem correção.
    const nested = ['(/document.tex', '(./cap/um.tex', '! Undefined control sequence.', 'l.3 \\erro'];
    expect(parseTexLog(nested, 'main.tex', 2)[0]).toMatchObject({ file: 'cap/um.tex', line: 3 });
  });

  it('citação indefinida só conta na última passagem do TeX', () => {
    const lines = [
      'This is pdfTeX, Version 3.141592653',
      '(/document.tex',
      "LaTeX Warning: Citation `silva2020' on page 1 undefined on input line 9.",
      ')',
      'This is pdfTeX, Version 3.141592653',
      '(/document.tex',
      ')',
    ];
    expect(parseTexLog(lines, 'main.tex')).toEqual([]);
  });

  it('reconhece pacote ausente e citação indefinida', () => {
    const issues = parseTexLog(
      [
        '(/document.tex',
        "! LaTeX Error: File `minted.sty' not found.",
        "LaTeX Warning: Citation `silva2020' on page 1 undefined on input line 9.",
      ],
      'main.tex',
    );
    expect(issues.map((issue) => issue.kind)).toEqual(['missing-package', 'warning']);
    expect(issues[0]!.message).toContain('minted.sty');
  });
});
