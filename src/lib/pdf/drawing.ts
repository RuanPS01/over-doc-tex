import type { Drawing, NormalizedPoint, NormalizedRect, Stroke, TextBox } from '@shared/firestore/types';

/** Tolerância da simplificação (fração da página), como em docs/07-fluxos.md. */
export const SIMPLIFY_EPSILON = 0.002;
/** Teto de pontos por desenho (o documento do Firestore tem 1 MiB). */
export const MAX_DRAWING_POINTS = 2000;
/** Teto de caixas de texto por desenho e de caracteres por caixa (também pelo 1 MiB do documento). */
export const MAX_DRAWING_TEXTS = 40;
export const MAX_TEXT_LENGTH = 4000;
/** Proporção (altura / largura) de uma página A4, usada quando a da página não é conhecida. */
export const A4_ASPECT = 842 / 595;

type Point = [number, number];

function distanceToSegment([x, y]: Point, [x1, y1]: Point, [x2, y2]: Point): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / length));
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
}

/** Ramer-Douglas-Peucker: tira os pontos que quase não mudam o traço. */
export function simplify(points: readonly Point[], epsilon = SIMPLIFY_EPSILON): Point[] {
  if (points.length <= 2) return [...points];
  let farthest = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const distance = distanceToSegment(points[i]!, points[0]!, points.at(-1)!);
    if (distance > farthest) {
      farthest = distance;
      index = i;
    }
  }
  if (farthest <= epsilon) return [points[0]!, points.at(-1)!];
  return [...simplify(points.slice(0, index + 1), epsilon).slice(0, -1), ...simplify(points.slice(index), epsilon)];
}

const round = (value: number) => Math.round(Math.min(1, Math.max(0, value)) * 10_000) / 10_000;

/** Pontos [x, y] coletados viram a lista achatada do Firestore, simplificada e arredondada. */
export function flattenStroke(points: readonly Point[]): number[] {
  return simplify(points).flatMap(([x, y]) => [round(x), round(y)]);
}

/**
 * Cantos da caixa de texto depois da rotação, de 0 a 1 na página. A rotação
 * acontece na página como ela aparece (pixels): por isso a proporção da página
 * entra na conta, senão a caixa girada sairia deformada.
 */
export function textCorners(box: Pick<TextBox, 'rect' | 'rotation'>, aspect: number): Array<[number, number]> {
  const { x, y, width, height } = box.rect;
  const cx = x + width / 2;
  const cy = (y + height / 2) * aspect;
  const angle = (box.rotation * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const half = [width / 2, (height / 2) * aspect] as const;
  return ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([sx, sy]) => {
    const dx = sx * half[0];
    const dy = sy * half[1];
    return [cx + dx * cos - dy * sin, (cy + dx * sin + dy * cos) / aspect];
  });
}

/** Caixa que contém traços, formas e textos (a espessura do traço não entra). */
export function boundsOf(strokes: readonly Stroke[], texts: readonly TextBox[] = [], aspect = A4_ASPECT): NormalizedRect {
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  const include = (x: number, y: number) => {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  };
  for (const stroke of strokes) {
    for (let i = 0; i + 1 < stroke.points.length; i += 2) include(stroke.points[i]!, stroke.points[i + 1]!);
  }
  for (const text of texts) for (const [x, y] of textCorners(text, aspect)) include(Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y)));
  if (minX > maxX) return { x: 0, y: 0, width: 0, height: 0 };
  return { x: round(minX), y: round(minY), width: round(maxX - minX), height: round(maxY - minY) };
}

const roundRect = (rect: NormalizedRect): NormalizedRect => ({ x: round(rect.x), y: round(rect.y), width: round(rect.width), height: round(rect.height) });

/**
 * Desenho pronto para gravar, ou nulo se ficou vazio ou passou dos tetos.
 * Sem textos, o campo `texts` não entra (o Firestore não aceita undefined).
 */
export function buildDrawing(strokes: readonly Stroke[], texts: readonly TextBox[] = [], aspect = A4_ASPECT): Drawing | null {
  const kept = strokes.filter((stroke) => stroke.points.length >= 2);
  const keptTexts = texts.filter((text) => text.text.trim().length > 0).map((text) => ({ ...text, rect: roundRect(text.rect) }));
  const total = kept.reduce((sum, stroke) => sum + stroke.points.length / 2, 0);
  if (kept.length + keptTexts.length === 0 || total > MAX_DRAWING_POINTS) return null;
  if (keptTexts.length > MAX_DRAWING_TEXTS || keptTexts.some((text) => text.text.length > MAX_TEXT_LENGTH)) return null;
  const bounds = boundsOf(kept, keptTexts, aspect);
  return keptTexts.length > 0 ? { strokes: kept, texts: keptTexts, bounds } : { strokes: kept, bounds };
}

/** Desenho inteiro deslocado (traços, formas, textos e a caixa), sem limitar à página. */
export function shiftDrawing(drawing: Drawing, dx: number, dy: number): Drawing {
  const shifted: Drawing = {
    bounds: { ...drawing.bounds, x: round(drawing.bounds.x + dx), y: round(drawing.bounds.y + dy) },
    strokes: drawing.strokes.map((stroke) => ({
      ...stroke,
      points: stroke.points.map((value, index) => round(value + (index % 2 === 0 ? dx : dy))),
    })),
  };
  if (drawing.texts) shifted.texts = drawing.texts.map((text) => ({ ...text, rect: { ...text.rect, x: round(text.rect.x + dx), y: round(text.rect.y + dy) } }));
  return shifted;
}

/** O pin fica no canto superior direito do desenho. */
export function pinPointFor(bounds: NormalizedRect): NormalizedPoint {
  return { x: round(bounds.x + bounds.width), y: round(bounds.y) };
}

/**
 * Pin arrastado para outro lugar da página: o ponto e o desenho andam juntos.
 * O deslocamento é limitado para nada sair da página (de 0 a 1).
 */
export function movePin(point: NormalizedPoint, drawing: Drawing | null, target: NormalizedPoint): { point: NormalizedPoint; drawing: Drawing | null } {
  let dx = target.x - point.x;
  let dy = target.y - point.y;
  if (drawing) {
    const { bounds } = drawing;
    dx = Math.min(Math.max(dx, -bounds.x), 1 - bounds.x - bounds.width);
    dy = Math.min(Math.max(dy, -bounds.y), 1 - bounds.y - bounds.height);
  }
  const moved = { x: round(point.x + dx), y: round(point.y + dy) };
  if (!drawing) return { point: moved, drawing: null };
  return { point: moved, drawing: shiftDrawing(drawing, dx, dy) };
}

/** Pontos achatados para o atributo points do SVG (viewBox de 0 a 1). */
export function svgPoints(points: readonly number[]): string {
  const pairs: string[] = [];
  for (let i = 0; i + 1 < points.length; i += 2) pairs.push(`${points[i]},${points[i + 1]}`);
  return pairs.join(' ');
}

/** O marca-texto é translúcido por padrão. */
export const HIGHLIGHTER_OPACITY = 0.4;

/** Opacidade do traço como ela aparece (o marca-texto antigo não tinha o campo). */
export const strokeOpacity = (stroke: Pick<Stroke, 'tool' | 'opacity'>) => stroke.opacity ?? (stroke.tool === 'highlighter' ? HIGHLIGHTER_OPACITY : 1);

/** Ponta da seta (triângulo), em coordenadas com y para baixo, a partir do fim da linha. */
export function arrowHead(x1: number, y1: number, x2: number, y2: number, lineWidth: number): Array<[number, number]> {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const length = Math.max(10, lineWidth * 4.5);
  const spread = Math.PI / 7;
  return [
    [x2, y2],
    [x2 - length * Math.cos(angle - spread), y2 - length * Math.sin(angle - spread)],
    [x2 - length * Math.cos(angle + spread), y2 - length * Math.sin(angle + spread)],
  ];
}

/** Altura da linha do texto flutuante, em múltiplos do tamanho da letra (a mesma na tela e no PDF anotado). */
export const TEXT_LINE_HEIGHT = 1.25;
/** Folga interna da caixa de texto, em múltiplos do tamanho da letra. */
export const TEXT_PADDING = 0.3;
/** Espessura da borda da caixa de texto, como fração da largura da página. */
export const TEXT_BORDER_FRACTION = 0.0018;
