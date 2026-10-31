import type { Drawing, NormalizedPoint, NormalizedRect, Stroke } from '@shared/firestore/types';

/** Tolerância da simplificação (fração da página), como em docs/07-fluxos.md. */
export const SIMPLIFY_EPSILON = 0.002;
/** Teto de pontos por desenho (o documento do Firestore tem 1 MiB). */
export const MAX_DRAWING_POINTS = 2000;

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

export function boundsOf(strokes: readonly Stroke[]): NormalizedRect {
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  for (const stroke of strokes) {
    for (let i = 0; i + 1 < stroke.points.length; i += 2) {
      minX = Math.min(minX, stroke.points[i]!);
      maxX = Math.max(maxX, stroke.points[i]!);
      minY = Math.min(minY, stroke.points[i + 1]!);
      maxY = Math.max(maxY, stroke.points[i + 1]!);
    }
  }
  if (minX > maxX) return { x: 0, y: 0, width: 0, height: 0 };
  return { x: round(minX), y: round(minY), width: round(maxX - minX), height: round(maxY - minY) };
}

/** Desenho pronto para gravar, ou nulo se passou do teto de pontos. */
export function buildDrawing(strokes: readonly Stroke[]): Drawing | null {
  const kept = strokes.filter((stroke) => stroke.points.length >= 2);
  const total = kept.reduce((sum, stroke) => sum + stroke.points.length / 2, 0);
  if (kept.length === 0 || total > MAX_DRAWING_POINTS) return null;
  return { strokes: kept, bounds: boundsOf(kept) };
}

/** O pin fica no canto superior direito do desenho. */
export function pinPointFor(bounds: NormalizedRect): NormalizedPoint {
  return { x: round(bounds.x + bounds.width), y: round(bounds.y) };
}

/** Pontos achatados para o atributo points do SVG (viewBox de 0 a 1). */
export function svgPoints(points: readonly number[]): string {
  const pairs: string[] = [];
  for (let i = 0; i + 1 < points.length; i += 2) pairs.push(`${points[i]},${points[i + 1]}`);
  return pairs.join(' ');
}
