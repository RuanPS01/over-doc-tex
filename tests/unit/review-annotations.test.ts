import { describe, expect, it } from 'vitest';
import { decodeSyncData, encodeSyncData, parseSynctex, pdfAt, sourceAt } from '@/lib/latex/synctex';
import { projectPathFromTex } from '@/lib/latex/prepare';
import { boundsOf, buildDrawing, flattenStroke, MAX_DRAWING_POINTS, pinPointFor, simplify } from '@/lib/pdf/drawing';
import { buildQuote, normalizeRects } from '@/lib/pdf/text-anchor';

// 1 bp = 65781.76 sp; a página começa a 1 pol. (4736286 sp) da borda.
const sp = (bp: number) => Math.round(bp * 65781.76);
const SYNCTEX = [
  'SyncTeX Version:1',
  'Input:1:/document.tex',
  'Input:2:/texlive/texmf-dist/tex/latex/base/article.cls',
  'Input:3://./cap/um.tex',
  'Output:pdf',
  'Magnification:1000',
  'Unit:1',
  'X Offset:0',
  'Y Offset:0',
  'Content:',
  '{1',
  `[1,3:${sp(72)},${sp(100)}:${sp(450)},${sp(700)},0`,
  `h1,4:${sp(72)},${sp(120)}:${sp(450)},${sp(10)},${sp(2)}`,
  `x1,4:${sp(80)},${sp(120)}`,
  `h3,7:${sp(72)},${sp(200)}:${sp(450)},${sp(10)},${sp(2)}`,
  `g2,99:${sp(300)},${sp(300)}`,
  ']',
  '}1',
  '{2',
  `h1,12:${sp(72)},${sp(90)}:${sp(450)},${sp(10)},${sp(2)}`,
  '}2',
  'Postamble:',
].join('\n');

describe('SyncTeX', () => {
  const data = parseSynctex(SYNCTEX, {
    toProjectPath: (raw) => projectPathFromTex(raw, 'tese/main.tex'),
    // O principal chegou ao TeX sem o preâmbulo (formato em cache): +10 linhas.
    lineOffset: (path) => (path === 'tese/main.tex' ? 10 : 0),
  });

  it('guarda só arquivos do projeto, com caminhos e linhas corrigidos', () => {
    expect(data.files).toEqual(['tese/main.tex', 'tese/cap/um.tex']);
    expect(data.pages).toHaveLength(2);
    expect(data.pages[0]!.every((record) => record.line !== 99)).toBe(true);
  });

  it('busca reversa: o ponto clicado vira arquivo e linha', () => {
    expect(sourceAt(data, 1, 200, 118)).toEqual({ path: 'tese/main.tex', line: 14 });
    expect(sourceAt(data, 1, 200, 199)).toEqual({ path: 'tese/cap/um.tex', line: 7 });
    expect(sourceAt(data, 2, 100, 89)).toEqual({ path: 'tese/main.tex', line: 22 });
  });

  it('busca direta: a linha vira página e altura no PDF', () => {
    expect(pdfAt(data, 'tese/cap/um.tex', 7)).toMatchObject({ page: 1 });
    expect(pdfAt(data, 'tese/main.tex', 22)?.page).toBe(2);
    expect(pdfAt(data, 'outro.tex', 1)).toBeNull();
  });

  it('o formato compacto da versão volta igual', () => {
    const decoded = decodeSyncData(encodeSyncData(data));
    expect(decoded.files).toEqual(data.files);
    expect(sourceAt(decoded, 1, 200, 199)).toEqual({ path: 'tese/cap/um.tex', line: 7 });
  });
});

describe('comentário em trecho', () => {
  it('acha a citação no texto da página, com contexto e posição, ignorando quebras de linha', () => {
    const page = 'Introdução\nA revisão de documentos científicos ainda depende\nde trocas de arquivos por e-mail.';
    const anchor = buildQuote(page, 'ainda depende de trocas')!;
    expect(anchor.quote.exact).toBe('ainda depende de trocas');
    expect(anchor.quote.prefix.endsWith('científicos')).toBe(true);
    expect(anchor.quote.suffix.startsWith('de arquivos')).toBe(true);
    expect(page.slice(anchor.position.start, anchor.position.end)).toBe('ainda depende\nde trocas');
  });

  it('junta os retângulos da mesma linha e normaliza pela página', () => {
    const page = { left: 100, top: 50, width: 600, height: 800 };
    const rects = normalizeRects(
      [
        { left: 160, top: 90, width: 100, height: 16 },
        { left: 262, top: 90, width: 120, height: 16 },
        { left: 100, top: 110, width: 200, height: 16 },
      ],
      page,
    );
    expect(rects).toHaveLength(2);
    expect(rects[0]).toEqual({ x: 0.1, y: 0.05, width: 0.37, height: 0.02 });
  });
});

describe('desenho livre', () => {
  it('simplifica pontos quase colineares e mantém as pontas', () => {
    const line: Array<[number, number]> = Array.from({ length: 50 }, (_, index) => [index / 100, index / 100 + (index % 2) * 0.0001]);
    expect(simplify(line)).toEqual([line[0], line[49]]);
    expect(flattenStroke(line)).toEqual([0, 0, 0.49, 0.4901]);
  });

  it('calcula a caixa, o ponto do pin e respeita o teto de pontos', () => {
    const stroke = { tool: 'pen' as const, color: 'annotation-2' as const, width: 0.004, points: [0.2, 0.3, 0.5, 0.25, 0.4, 0.6] };
    expect(boundsOf([stroke])).toEqual({ x: 0.2, y: 0.25, width: 0.3, height: 0.35 });
    expect(pinPointFor(boundsOf([stroke]))).toEqual({ x: 0.5, y: 0.25 });
    expect(buildDrawing([stroke])?.bounds.width).toBe(0.3);
    const huge = { ...stroke, points: Array.from({ length: (MAX_DRAWING_POINTS + 1) * 2 }, () => 0.5) };
    expect(buildDrawing([huge])).toBeNull();
    expect(buildDrawing([])).toBeNull();
  });
});
