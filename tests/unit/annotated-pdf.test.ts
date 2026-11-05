import { PDFDocument, StandardFonts, degrees } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { hslChannelsToRgb } from '@/lib/color';
import {
  applyMatrix,
  buildAnnotatedPdf,
  extendedView,
  makeEncoder,
  marginWidthFor,
  pageGeometry,
  type AnnotatedPdfInput,
  type AnnotatedPdfThread,
} from '@/lib/pdf/annotated-pdf';
import { layoutMarginBoxes, markdownToPlainText, wrapText } from '@/lib/pdf/comment-layout';

const color = (channels: string) => hslChannelsToRgb(channels);
const palette: AnnotatedPdfInput['palette'] = {
  ink: color('0 0% 7.1%'),
  muted: color('0 0% 45.1%'),
  rule: color('0 0% 87.8%'),
  panel: color('0 0% 96.5%'),
  paper: color('0 0% 100%'),
  pinText: color('0 0% 100%'),
  annotation: { 'annotation-1': color('48 96% 53%'), 'annotation-2': color('0 84% 60%'), 'annotation-3': color('217 91% 60%'), 'annotation-4': color('142 71% 45%') },
};
const text: AnnotatedPdfInput['text'] = {
  heading: 'Revisão #1 · versão 1.0 · comentários',
  summaryTitle: 'Comentários completos',
  continued: 'Continua no fim do PDF.',
  previousRound: 'Rodada anterior',
  page: (page) => `Página ${page}`,
  hiddenOnPage: (count) => `Mais ${count}`,
};

function pin(number: number, page: number, y: number, body = 'Explicar melhor.'): AnnotatedPdfThread {
  return {
    number,
    anchor: { type: 'pin', page, point: { x: 0.5, y }, drawing: null },
    state: 'open',
    kindLabel: 'Ponto',
    statusLabel: '',
    previousRound: [],
    comments: [{ author: 'Maria (revisor)', date: '05/11/2026 10:00', body }],
  };
}

async function samplePdf(pages: number, rotation = 0): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  for (let index = 0; index < pages; index++) {
    const page = doc.addPage([595, 842]);
    page.setRotation(degrees(rotation));
    page.drawText(`Página ${index + 1}`, { x: 72, y: 760, size: 14, font });
  }
  return doc.save();
}

describe('PDF com anotações: geometria', () => {
  const view = { x: 10, y: 20, width: 595, height: 842 };

  it('a página mostrada leva aos cantos certos do PDF em cada rotação', () => {
    for (const rotation of [0, 90, 180, 270]) {
      const geometry = pageGeometry(view, rotation);
      const quarter = rotation % 180 !== 0;
      expect([geometry.width, geometry.height]).toEqual(quarter ? [842, 595] : [595, 842]);
      const corners = [
        applyMatrix(geometry.matrix, 0, 0),
        applyMatrix(geometry.matrix, geometry.width, geometry.height),
      ].flat();
      // Os cantos opostos da página mostrada caem nos cantos da área visível do PDF.
      expect(corners.every((value) => [10, 20, 605, 862].some((edge) => Math.abs(value - edge) < 1e-9))).toBe(true);
    }
    // Girada 90 graus (horário): o canto de baixo à esquerda da página mostrada é o de baixo à direita do PDF.
    expect(applyMatrix(pageGeometry(view, 90).matrix, 0, 0)).toEqual([605, 20]);
  });

  it('a margem cresce para a direita da página como ela aparece', () => {
    const margin = marginWidthFor(595);
    expect(margin).toBe(250);
    expect(extendedView(pageGeometry(view, 0), margin)).toEqual({ x: 10, y: 20, width: 595 + margin, height: 842 });
    // Girada 90 graus, a direita de quem lê é o alto do PDF.
    expect(extendedView(pageGeometry(view, 90), marginWidthFor(842))).toEqual({ x: 10, y: 20, width: 595, height: 842 + marginWidthFor(842) });
    expect(marginWidthFor(300)).toBe(180);
    expect(marginWidthFor(2000)).toBe(300);
  });
});

describe('PDF com anotações: margem de comentários', () => {
  const area = { top: 20, bottom: 200, gap: 6, padding: 5, continuationHeight: 9 };

  it('cada cartão fica na altura da marcação e empurra o seguinte, sem sobrepor', () => {
    const placements = layoutMarginBoxes(
      [
        { desiredTop: 50, lineHeights: [12, 9], minLines: 1 },
        { desiredTop: 55, lineHeights: [12, 9], minLines: 1 },
      ],
      area,
    );
    expect(placements[0]).toMatchObject({ top: 50, height: 31, truncated: false });
    expect(placements[1]!.top).toBe(50 + 31 + 6);
  });

  it('no fim da página os cartões sobem; sem espaço, o mais alto perde linhas', () => {
    const tall = { desiredTop: 190, lineHeights: [12, ...Array<number>(20).fill(9)], minLines: 1 };
    const [placement] = layoutMarginBoxes([tall], area);
    expect(placement!.top + placement!.height).toBeLessThanOrEqual(200);
    expect(placement!.top).toBeGreaterThanOrEqual(20);
    expect(placement!.truncated).toBe(true);
    expect(placement!.shownLines).toBeLessThan(21);
  });

  it('o que não cabe nem com o cabeçalho sai da margem (fica no fim do PDF)', () => {
    const boxes = Array.from({ length: 12 }, (_, index) => ({ desiredTop: 20 + index, lineHeights: [12, 9, 9], minLines: 1 }));
    const placements = layoutMarginBoxes(boxes, area);
    const shown = placements.filter((placement) => !placement.hidden);
    expect(placements.some((placement) => placement.hidden)).toBe(true);
    const sorted = [...shown].sort((a, b) => a.top - b.top);
    sorted.forEach((placement, index) => {
      expect(placement.top).toBeGreaterThanOrEqual(20);
      expect(placement.top + placement.height).toBeLessThanOrEqual(200);
      if (index > 0) expect(placement.top).toBeGreaterThanOrEqual(sorted[index - 1]!.top + sorted[index - 1]!.height + 6);
    });
  });

  it('Markdown vira texto simples e a quebra respeita a largura', () => {
    expect(markdownToPlainText('**Atenção**: veja [o artigo](https://x.org) e `codigo`.\n\n- item')).toBe('Atenção: veja o artigo (https://x.org) e codigo.\n\n• item');
    const measure = (value: string) => value.length;
    expect(wrapText('um dois tres quatro', 8, measure)).toEqual(['um dois', 'tres', 'quatro']);
    expect(wrapText('abcdefghij', 4, measure)).toEqual(['abcd', 'efgh', 'ij']);
    expect(wrapText('linha 1\nlinha 2', 20, measure)).toEqual(['linha 1', 'linha 2']);
  });

  it('o que a fonte padrão não desenha vira algo que ela desenha', () => {
    const encode = makeEncoder(new Set([...'abcdeéçãoõ ?-'].map((char) => char.codePointAt(0)!)));
    expect(encode('ação é')).toBe('ação é');
    expect(encode('ő')).toBe('o');
    expect(encode('a\u{1F600}b')).toBe('a?b');
    expect(encode('a−b\tc')).toBe('a-b c');
  });
});

describe('PDF com anotações: arquivo final', () => {
  it('cada página ganha a margem e o PDF continua com as mesmas páginas', async () => {
    const result = await buildAnnotatedPdf(await samplePdf(2), { threads: [pin(1, 1, 0.2), pin(2, 2, 0.6)], text, palette });
    const doc = await PDFDocument.load(result);
    expect(doc.getPageCount()).toBe(2);
    for (const page of doc.getPages()) {
      expect(page.getCropBox().width).toBe(595 + marginWidthFor(595));
      expect(page.getCropBox().height).toBe(842);
    }
  });

  it('comentário longo demais para a margem leva às páginas de comentários completos', async () => {
    const long = Array.from({ length: 1500 }, () => 'palavra').join(' ');
    const result = await buildAnnotatedPdf(await samplePdf(1), { threads: [pin(1, 1, 0.2, long)], text, palette });
    const doc = await PDFDocument.load(result);
    expect(doc.getPageCount()).toBeGreaterThan(1);
  });

  it('página girada: a margem fica à direita de quem lê', async () => {
    const result = await buildAnnotatedPdf(await samplePdf(1, 90), { threads: [pin(1, 1, 0.3)], text, palette });
    const [page] = (await PDFDocument.load(result)).getPages();
    expect(page!.getRotation().angle).toBe(90);
    expect(page!.getCropBox()).toMatchObject({ width: 595, height: 842 + marginWidthFor(842) });
  });
});
