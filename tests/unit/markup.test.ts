import { describe, expect, it } from 'vitest';
import type { TextBox } from '@shared/firestore/types';
import {
  DEFAULT_DRAW_STYLE,
  DEFAULT_TEXT_STYLE,
  applyDrawPatch,
  applyTextPatch,
  changedKeys,
  constrainEnd,
  dashArray,
  newTextBox,
  normalizeRotation,
  ptFromSize,
  sizeFromPt,
  strokeFromInput,
  styleOfStroke,
  styleOfText,
  withTextStyle,
} from '@/features/review/model/markup';
import {
  A4_ASPECT,
  boundsOf,
  buildDrawing,
  fitInPage,
  MAX_DRAWING_TEXTS,
  moveDrawing,
  movePin,
  rotateDrawing,
  scaleDrawing,
  shiftDrawing,
  strokeOpacity,
  textCorners,
} from '@/lib/pdf/drawing';

const A4 = { width: 595, height: 842 };

const box = (overrides: Partial<TextBox> = {}): TextBox => ({
  ...newTextBox({ x: 0.2, y: 0.3 }, DEFAULT_TEXT_STYLE, A4),
  text: 'Olá',
  ...overrides,
});

describe('desenho: formas', () => {
  it('a forma guarda os dois cantos, e os campos opcionais só entram quando valem algo', () => {
    const rect = strokeFromInput({ ...DEFAULT_DRAW_STYLE, tool: 'rect', fill: 'annotation-1', fillOpacity: 0.3 }, [
      [0.1, 0.2],
      [0.15, 0.25],
      [0.4, 0.5],
    ]);
    expect(rect).toEqual({ tool: 'rect', color: 'annotation-2', width: 0.00375, points: [0.1, 0.2, 0.4, 0.5], fill: { color: 'annotation-1', opacity: 0.3 } });
    expect(Object.keys(rect!)).not.toContain('opacity');
    expect(Object.keys(rect!)).not.toContain('dash');
    // Linha não tem preenchimento, mesmo com a cor escolhida no painel.
    const line = strokeFromInput({ ...DEFAULT_DRAW_STYLE, tool: 'line', fill: 'annotation-1', opacity: 0.5, dash: 'dashed' }, [
      [0.1, 0.1],
      [0.3, 0.3],
    ]);
    expect(line).toMatchObject({ tool: 'line', opacity: 0.5, dash: 'dashed' });
    expect(line).not.toHaveProperty('fill');
    // Um clique sem arrastar não vira forma.
    expect(strokeFromInput({ ...DEFAULT_DRAW_STYLE, tool: 'ellipse' }, [[0.2, 0.2], [0.2005, 0.2]])).toBeNull();
  });

  it('com Shift: quadrado e círculo de lados iguais na tela, linha a cada 45 graus', () => {
    const [x, y] = constrainEnd('rect', [0.1, 0.1], [0.3, 0.15], A4_ASPECT);
    expect(x - 0.1).toBeCloseTo((y - 0.1) * A4_ASPECT, 6);
    const [lx, ly] = constrainEnd('line', [0.1, 0.1], [0.5, 0.12], A4_ASPECT);
    expect(ly).toBeCloseTo(0.1, 6);
    expect(lx).toBeGreaterThan(0.4);
  });

  it('o marca-texto antigo (sem opacidade gravada) continua translúcido', () => {
    expect(strokeOpacity({ tool: 'highlighter' })).toBe(0.4);
    expect(strokeOpacity({ tool: 'pen' })).toBe(1);
    expect(strokeOpacity({ tool: 'rect', opacity: 0.25 })).toBe(0.25);
    expect(dashArray('solid', 3)).toBeUndefined();
    expect(dashArray('dashed', 2)).toBe('8 5');
  });
});

describe('desenho: texto flutuante', () => {
  it('a caixa nova nasce no clique, com uma linha de altura, e o tamanho vai e volta em pontos', () => {
    const created = newTextBox({ x: 0.9, y: 0.3 }, DEFAULT_TEXT_STYLE, A4);
    expect(created.rect.x + created.rect.width).toBeLessThanOrEqual(1);
    expect(created.size).toBe(sizeFromPt(14, 595));
    expect(ptFromSize(created.size, 595)).toBe(14);
    expect(created.rotation).toBe(0);
    expect(created).not.toHaveProperty('sizePt');
  });

  it('o estilo do painel muda a caixa sem mexer no texto, no lugar nem na rotação', () => {
    const original = box({ rotation: 30 });
    const restyled = withTextStyle(original, { ...styleOfText(original, 595), bold: true, sizePt: 20, font: 'mono' }, 595);
    expect(restyled).toMatchObject({ text: 'Olá', rotation: 30, rect: original.rect, bold: true, font: 'mono' });
    expect(ptFromSize(restyled.size, 595)).toBe(20);
  });

  it('girar 90 graus troca largura e altura na tela (a proporção da página entra na conta)', () => {
    const square = box({ rect: { x: 0.4, y: 0.4, width: 0.2, height: 0.1 }, rotation: 90 });
    const xs = textCorners(square, A4_ASPECT).map(([x]) => x);
    const ys = textCorners(square, A4_ASPECT).map(([, y]) => y);
    // Altura de 0,1 da página vira largura de 0,1 * 842 / 595 da largura.
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(0.1 * A4_ASPECT, 6);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(0.2 / A4_ASPECT, 6);
  });

  it('a rotação encaixa perto de 15 graus (ou sempre, com Shift) e fica entre -180 e 180', () => {
    expect(normalizeRotation(44)).toBe(45);
    expect(normalizeRotation(40)).toBe(40);
    expect(normalizeRotation(40, true)).toBe(45);
    expect(normalizeRotation(270)).toBe(-90);
  });
});

describe('desenho: gravar, mover e levar adiante', () => {
  const rect = strokeFromInput({ ...DEFAULT_DRAW_STYLE, tool: 'rect' }, [[0.1, 0.1], [0.2, 0.2]])!;

  it('o desenho junta formas e textos; caixa vazia não entra e sem texto o campo nem existe', () => {
    const drawing = buildDrawing([rect], [box(), box({ text: '   ' })], A4_ASPECT)!;
    expect(drawing.texts).toHaveLength(1);
    expect(drawing.bounds.x).toBe(0.1);
    expect(drawing.bounds.y).toBe(0.1);
    expect(drawing.bounds.width).toBeGreaterThan(0.2);
    expect(buildDrawing([rect], [box({ text: '' })])).not.toHaveProperty('texts');
    expect(buildDrawing([], [box({ text: '' })])).toBeNull();
    expect(buildDrawing([], Array.from({ length: MAX_DRAWING_TEXTS + 1 }, () => box()))).toBeNull();
    // Só texto também é um desenho.
    expect(buildDrawing([], [box()])?.strokes).toEqual([]);
  });

  it('mover o número leva junto as formas e os textos', () => {
    const drawing = buildDrawing([rect], [box()], A4_ASPECT)!;
    const moved = movePin({ x: drawing.bounds.x + drawing.bounds.width, y: drawing.bounds.y }, drawing, { x: 0.9, y: 0.5 });
    const dx = moved.drawing!.bounds.x - drawing.bounds.x;
    const dy = moved.drawing!.bounds.y - drawing.bounds.y;
    expect(moved.drawing!.texts![0]!.rect.x).toBeCloseTo(drawing.texts![0]!.rect.x + dx, 4);
    expect(moved.drawing!.texts![0]!.rect.y).toBeCloseTo(drawing.texts![0]!.rect.y + dy, 4);
    expect(moved.drawing!.strokes[0]!.points[0]).toBeCloseTo(0.1 + dx, 4);
    // Deslocar sem textos não cria o campo.
    expect(shiftDrawing({ strokes: [rect], bounds: boundsOf([rect]) }, 0.1, 0)).not.toHaveProperty('texts');
  });
});

describe('desenho selecionado: mover, girar, redimensionar e mudar o estilo', () => {
  const rect = strokeFromInput({ ...DEFAULT_DRAW_STYLE, tool: 'rect' }, [[0.2, 0.2], [0.4, 0.3]])!;
  const pen = strokeFromInput(DEFAULT_DRAW_STYLE, [[0.2, 0.4], [0.3, 0.45], [0.4, 0.4]])!;
  const drawing = buildDrawing([rect, pen], [], A4_ASPECT)!;

  it('girar 90 graus em torno do centro: o retângulo guarda a rotação e os pontos do traço giram', () => {
    const pivot = { x: drawing.bounds.x + drawing.bounds.width / 2, y: drawing.bounds.y + drawing.bounds.height / 2 };
    const turned = rotateDrawing(drawing, 90, pivot, A4_ASPECT);
    expect(turned.strokes[0]!.rotation).toBe(90);
    // O centro do retângulo gira em torno do centro do desenho; a caixa dele não muda de tamanho.
    const [x1, y1, x2, y2] = turned.strokes[0]!.points;
    expect(x2! - x1!).toBeCloseTo(0.2, 4);
    expect(y2! - y1!).toBeCloseTo(0.1, 4);
    // Os limites passam a ser os do desenho girado: largura e altura trocam na tela.
    expect(turned.bounds.width * 1).toBeCloseTo(drawing.bounds.height * A4_ASPECT, 2);
    // Girar de volta devolve o desenho.
    const back = rotateDrawing(turned, -90, pivot, A4_ASPECT);
    expect(back.strokes[0]).not.toHaveProperty('rotation');
    expect(back.strokes[1]!.points[0]).toBeCloseTo(pen.points[0]!, 3);
  });

  it('esticar a partir do canto de cima: pontos e caixa crescem, a espessura não', () => {
    const origin = { x: drawing.bounds.x, y: drawing.bounds.y };
    const scaled = scaleDrawing(drawing, 2, 1.5, origin, A4_ASPECT);
    expect(scaled.bounds.x).toBeCloseTo(drawing.bounds.x, 4);
    expect(scaled.bounds.width).toBeCloseTo(drawing.bounds.width * 2, 3);
    expect(scaled.bounds.height).toBeCloseTo(drawing.bounds.height * 1.5, 3);
    expect(scaled.strokes[0]!.width).toBe(rect.width);
  });

  it('o texto acompanha: gira junto e a letra cresce com a escala', () => {
    const withText = buildDrawing([], [box({ rect: { x: 0.3, y: 0.3, width: 0.2, height: 0.05 } })], A4_ASPECT)!;
    const origin = { x: withText.bounds.x, y: withText.bounds.y };
    expect(scaleDrawing(withText, 2, 2, origin, A4_ASPECT).texts![0]!.size).toBeCloseTo(withText.texts![0]!.size * 2, 4);
    const pivot = { x: 0.4, y: 0.325 };
    expect(rotateDrawing(withText, 30, pivot, A4_ASPECT).texts![0]!.rotation).toBe(30);
  });

  it('mover não deixa sair da página; girar perto da borda empurra de volta para dentro', () => {
    const moved = moveDrawing(drawing, 5, -5);
    expect(moved.bounds.x + moved.bounds.width).toBeLessThanOrEqual(1.0001);
    expect(moved.bounds.y).toBeGreaterThanOrEqual(0);
    const corner = buildDrawing([strokeFromInput({ ...DEFAULT_DRAW_STYLE, tool: 'rect' }, [[0.9, 0.1], [0.99, 0.12]])!], [], A4_ASPECT)!;
    const turned = rotateDrawing(corner, 45, { x: 0.945, y: 0.11 }, A4_ASPECT);
    expect(turned.bounds.x + turned.bounds.width).toBeLessThanOrEqual(1.0001);
    expect(fitInPage(turned, A4_ASPECT)).toEqual(turned);
  });

  it('a forma girada entra nos limites pelos cantos girados', () => {
    const turned = { ...rect, rotation: 45 };
    expect(boundsOf([turned], [], A4_ASPECT).width).toBeGreaterThan(boundsOf([rect], [], A4_ASPECT).width);
  });

  it('o painel muda só o que mudou: cor e preenchimento sim, tipo e pontos não', () => {
    const before = styleOfStroke(rect);
    const patch = changedKeys(before, { ...before, color: 'annotation-3', fill: 'annotation-1' });
    expect(patch).toEqual({ color: 'annotation-3', fill: 'annotation-1' });
    const restyled = applyDrawPatch(rect, patch);
    expect(restyled).toMatchObject({ tool: 'rect', points: rect.points, color: 'annotation-3', fill: { color: 'annotation-1', opacity: 0.25 }, width: rect.width });
    // Linha não ganha preenchimento; opacidade cheia e linha contínua saem do documento.
    const line = applyDrawPatch({ ...pen, opacity: 0.5, dash: 'dashed' }, { fill: 'annotation-1', opacity: 1, dash: 'solid' });
    expect(line).not.toHaveProperty('fill');
    expect(line).not.toHaveProperty('opacity');
    expect(line).not.toHaveProperty('dash');
  });

  it('o tamanho do texto só muda quando o tamanho mudou no painel', () => {
    const original = box({ size: 0.02351 });
    expect(applyTextPatch(original, { bold: true }, 595)).toMatchObject({ bold: true, size: 0.02351 });
    expect(applyTextPatch(original, { sizePt: 20 }, 595).size).toBe(sizeFromPt(20, 595));
  });
});
