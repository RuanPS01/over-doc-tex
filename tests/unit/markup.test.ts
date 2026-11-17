import { describe, expect, it } from 'vitest';
import type { TextBox } from '@shared/firestore/types';
import {
  DEFAULT_DRAW_STYLE,
  DEFAULT_TEXT_STYLE,
  constrainEnd,
  dashArray,
  newTextBox,
  normalizeRotation,
  ptFromSize,
  sizeFromPt,
  strokeFromInput,
  styleOfText,
  withTextStyle,
} from '@/features/review/model/markup';
import { A4_ASPECT, boundsOf, buildDrawing, MAX_DRAWING_TEXTS, movePin, shiftDrawing, strokeOpacity, textCorners } from '@/lib/pdf/drawing';

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
