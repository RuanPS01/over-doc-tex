import type { AnnotationColor, LineStyle, NormalizedPoint, Stroke, StrokeTool, TextAlign, TextBox, TextFont } from '@shared/firestore/types';
import { msg } from '@/lib/i18n';
import { TEXT_LINE_HEIGHT, TEXT_PADDING, flattenStroke } from '@/lib/pdf/drawing';

export { HIGHLIGHTER_OPACITY, TEXT_BORDER_FRACTION, TEXT_LINE_HEIGHT, TEXT_PADDING, arrowHead, strokeOpacity } from '@/lib/pdf/drawing';

/**
 * Estilos do desenho e do texto flutuante da revisão (painel "Desenho" e
 * "Texto" sobre o PDF). As cores são sempre nomes de token (--annotation-N):
 * o que se grava é o token, e a tela e o PDF anotado leem a cor dele.
 */

/** Ordem da paleta no painel: neutros, quentes e frios. */
export const MARKUP_COLORS: readonly AnnotationColor[] = [
  'annotation-8',
  'annotation-9',
  'annotation-10',
  'annotation-2',
  'annotation-5',
  'annotation-1',
  'annotation-4',
  'annotation-3',
  'annotation-6',
  'annotation-7',
];

/** Rótulos são chaves de tradução (msg): quem mostra chama t(). */
export const MARKUP_COLOR_LABELS: Record<AnnotationColor, string> = {
  'annotation-1': msg('Amarelo'),
  'annotation-2': msg('Vermelho'),
  'annotation-3': msg('Azul'),
  'annotation-4': msg('Verde'),
  'annotation-5': msg('Laranja'),
  'annotation-6': msg('Roxo'),
  'annotation-7': msg('Rosa'),
  'annotation-8': msg('Preto'),
  'annotation-9': msg('Cinza'),
  'annotation-10': msg('Branco'),
};

// Classes inteiras: o Tailwind só gera o que aparece escrito no código.
export const BG_CLASSES: Record<AnnotationColor, string> = {
  'annotation-1': 'bg-annotation-1',
  'annotation-2': 'bg-annotation-2',
  'annotation-3': 'bg-annotation-3',
  'annotation-4': 'bg-annotation-4',
  'annotation-5': 'bg-annotation-5',
  'annotation-6': 'bg-annotation-6',
  'annotation-7': 'bg-annotation-7',
  'annotation-8': 'bg-annotation-8',
  'annotation-9': 'bg-annotation-9',
  'annotation-10': 'bg-annotation-10',
};

export const TEXT_CLASSES: Record<AnnotationColor, string> = {
  'annotation-1': 'text-annotation-1',
  'annotation-2': 'text-annotation-2',
  'annotation-3': 'text-annotation-3',
  'annotation-4': 'text-annotation-4',
  'annotation-5': 'text-annotation-5',
  'annotation-6': 'text-annotation-6',
  'annotation-7': 'text-annotation-7',
  'annotation-8': 'text-annotation-8',
  'annotation-9': 'text-annotation-9',
  'annotation-10': 'text-annotation-10',
};

export const BORDER_CLASSES: Record<AnnotationColor, string> = {
  'annotation-1': 'border-annotation-1',
  'annotation-2': 'border-annotation-2',
  'annotation-3': 'border-annotation-3',
  'annotation-4': 'border-annotation-4',
  'annotation-5': 'border-annotation-5',
  'annotation-6': 'border-annotation-6',
  'annotation-7': 'border-annotation-7',
  'annotation-8': 'border-annotation-8',
  'annotation-9': 'border-annotation-9',
  'annotation-10': 'border-annotation-10',
};

export const STROKE_CLASSES: Record<AnnotationColor, string> = {
  'annotation-1': 'stroke-annotation-1',
  'annotation-2': 'stroke-annotation-2',
  'annotation-3': 'stroke-annotation-3',
  'annotation-4': 'stroke-annotation-4',
  'annotation-5': 'stroke-annotation-5',
  'annotation-6': 'stroke-annotation-6',
  'annotation-7': 'stroke-annotation-7',
  'annotation-8': 'stroke-annotation-8',
  'annotation-9': 'stroke-annotation-9',
  'annotation-10': 'stroke-annotation-10',
};

export const FILL_CLASSES: Record<AnnotationColor, string> = {
  'annotation-1': 'fill-annotation-1',
  'annotation-2': 'fill-annotation-2',
  'annotation-3': 'fill-annotation-3',
  'annotation-4': 'fill-annotation-4',
  'annotation-5': 'fill-annotation-5',
  'annotation-6': 'fill-annotation-6',
  'annotation-7': 'fill-annotation-7',
  'annotation-8': 'fill-annotation-8',
  'annotation-9': 'fill-annotation-9',
  'annotation-10': 'fill-annotation-10',
};

export const STROKE_TOOLS: ReadonlyArray<{ id: StrokeTool; label: string }> = [
  { id: 'pen', label: msg('Traço livre') },
  { id: 'highlighter', label: msg('Marca-texto') },
  { id: 'line', label: msg('Linha') },
  { id: 'arrow', label: msg('Seta') },
  { id: 'rect', label: msg('Retângulo') },
  { id: 'ellipse', label: msg('Elipse') },
];

export const LINE_STYLES: ReadonlyArray<{ id: LineStyle; label: string }> = [
  { id: 'solid', label: msg('Contínua') },
  { id: 'dashed', label: msg('Tracejada') },
  { id: 'dotted', label: msg('Pontilhada') },
];

/** Formas que têm área (aceitam preenchimento). */
export const isClosedShape = (tool: StrokeTool) => tool === 'rect' || tool === 'ellipse';

/** Largura de referência (pixels a 100%) para mostrar e escolher a espessura em px. */
export const REFERENCE_PAGE_PX = 800;

export interface DrawStyle {
  tool: StrokeTool;
  color: AnnotationColor;
  /** Espessura em px numa página de 800 px (vira fração da largura ao gravar). */
  widthPx: number;
  /** De 0 a 1. */
  opacity: number;
  dash: LineStyle;
  /** Preenchimento das formas fechadas; nulo é sem preenchimento. */
  fill: AnnotationColor | null;
  fillOpacity: number;
}

export const DEFAULT_DRAW_STYLE: DrawStyle = {
  tool: 'pen',
  color: 'annotation-2',
  widthPx: 3,
  opacity: 1,
  dash: 'solid',
  fill: null,
  fillOpacity: 0.25,
};

const round = (value: number) => Math.round(Math.min(1, Math.max(0, value)) * 10_000) / 10_000;

/**
 * Traço gravável a partir do que a pessoa fez: o caminho do traço livre e do
 * marca-texto, ou o ponto inicial e o final da forma. Campos opcionais só
 * entram quando valem algo (o Firestore não aceita undefined).
 */
export function strokeFromInput(style: DrawStyle, points: ReadonlyArray<[number, number]>): Stroke | null {
  if (points.length < 2) return null;
  const freehand = style.tool === 'pen' || style.tool === 'highlighter';
  const first = points[0]!;
  const last = points.at(-1)!;
  const flat = freehand ? flattenStroke(points) : [round(first[0]), round(first[1]), round(last[0]), round(last[1])];
  // Forma sem tamanho (um clique) não vale.
  if (!freehand && Math.abs(flat[2]! - flat[0]!) < 0.002 && Math.abs(flat[3]! - flat[1]!) < 0.002) return null;
  return styledStroke(style, flat);
}

/** Traço com o estilo do painel e os pontos já achatados (também a prévia, sem simplificar). */
export function styledStroke(style: DrawStyle, points: number[]): Stroke {
  const stroke: Stroke = { tool: style.tool, color: style.color, width: Math.round((style.widthPx / REFERENCE_PAGE_PX) * 100_000) / 100_000, points };
  if (style.opacity < 1) stroke.opacity = Math.round(style.opacity * 100) / 100;
  if (style.dash !== 'solid') stroke.dash = style.dash;
  if (isClosedShape(style.tool) && style.fill) stroke.fill = { color: style.fill, opacity: Math.round(style.fillOpacity * 100) / 100 };
  return stroke;
}

/**
 * Ponto final com Shift: quadrado, círculo, ou linha em múltiplos de 45 graus.
 * As contas são em pixels da página (`aspect` = altura / largura).
 */
export function constrainEnd(tool: StrokeTool, start: [number, number], end: [number, number], aspect: number): [number, number] {
  const dx = end[0] - start[0];
  const dy = (end[1] - start[1]) * aspect;
  if (isClosedShape(tool)) {
    const side = Math.max(Math.abs(dx), Math.abs(dy));
    return [start[0] + Math.sign(dx || 1) * side, start[1] + (Math.sign(dy || 1) * side) / aspect];
  }
  if (tool === 'line' || tool === 'arrow') {
    const length = Math.hypot(dx, dy);
    const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
    return [start[0] + Math.cos(angle) * length, start[1] + (Math.sin(angle) * length) / aspect];
  }
  return end;
}

/** Traço tracejado ou pontilhado em pixels, proporcional à espessura. */
export function dashArray(dash: LineStyle | undefined, lineWidth: number): string | undefined {
  if (dash === 'dashed') return `${lineWidth * 4} ${lineWidth * 2.5}`;
  if (dash === 'dotted') return `0.1 ${lineWidth * 2.2}`;
  return undefined;
}

export const TEXT_FONTS: ReadonlyArray<{ id: TextFont; label: string; family: string }> = [
  { id: 'sans', label: msg('Sem serifa'), family: 'Helvetica, Arial, sans-serif' },
  { id: 'serif', label: msg('Com serifa'), family: '"Times New Roman", Times, serif' },
  { id: 'mono', label: msg('Monoespaçada'), family: '"Courier New", Courier, monospace' },
];

export const fontFamilyOf = (font: TextFont) => TEXT_FONTS.find((item) => item.id === font)?.family ?? TEXT_FONTS[0]!.family;

export const TEXT_ALIGNS: ReadonlyArray<{ id: TextAlign; label: string }> = [
  { id: 'left', label: msg('Alinhar à esquerda') },
  { id: 'center', label: msg('Centralizar') },
  { id: 'right', label: msg('Alinhar à direita') },
];

/** Estilo do texto como o painel mostra: tamanho em pontos da página (12 pt numa A4). */
export type TextStyle = Omit<TextBox, 'text' | 'rect' | 'rotation' | 'size'> & { sizePt: number };

export const DEFAULT_TEXT_STYLE: TextStyle = {
  font: 'sans',
  sizePt: 14,
  color: 'annotation-2',
  opacity: 1,
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  align: 'left',
  background: null,
  border: null,
};

export const MIN_TEXT_PT = 6;
export const MAX_TEXT_PT = 96;

/** Tamanho gravado (fração da largura da página) a partir dos pontos, e o caminho de volta. */
export const sizeFromPt = (pt: number, pageWidthPt: number) => Math.round((pt / pageWidthPt) * 100_000) / 100_000;
export const ptFromSize = (size: number, pageWidthPt: number) => Math.round(size * pageWidthPt * 2) / 2;

/** Estilo de uma caixa existente, para o painel mostrar e editar. */
export function styleOfText(box: TextBox, pageWidthPt: number): TextStyle {
  const { text: _text, rect: _rect, rotation: _rotation, size, ...rest } = box;
  return { ...rest, sizePt: ptFromSize(size, pageWidthPt) };
}

/** Aplica o estilo do painel a uma caixa (o texto, o lugar e a rotação ficam). */
export function withTextStyle(box: TextBox, style: TextStyle, pageWidthPt: number): TextBox {
  const { sizePt, ...rest } = style;
  return { ...box, ...rest, size: sizeFromPt(sizePt, pageWidthPt) };
}

/**
 * Caixa nova onde a pessoa clicou: o clique é o canto superior esquerdo,
 * com largura de um terço da página e altura de uma linha (cresce ao digitar).
 */
export function newTextBox(point: NormalizedPoint, style: TextStyle, page: { width: number; height: number }): TextBox {
  const size = sizeFromPt(style.sizePt, page.width);
  const aspect = page.height / page.width;
  const width = Math.min(0.34, 1 - point.x);
  const height = (size * (TEXT_LINE_HEIGHT + TEXT_PADDING * 2)) / aspect;
  const { sizePt: _sizePt, ...rest } = style;
  return {
    ...rest,
    text: '',
    size,
    rotation: 0,
    rect: { x: round(Math.min(point.x, 1 - width)), y: round(Math.min(point.y, 1 - height)), width: round(Math.max(0.05, width)), height: round(height) },
  };
}

/** Ângulo entre -180 e 180, com encaixe a cada 15 graus perto deles (ou sempre, com Shift). */
export function normalizeRotation(degrees: number, snapAlways = false): number {
  let value = ((((degrees + 180) % 360) + 360) % 360) - 180;
  const snapped = Math.round(value / 15) * 15;
  if (snapAlways || Math.abs(value - snapped) < 3) value = snapped;
  return Math.round(value * 10) / 10;
}
