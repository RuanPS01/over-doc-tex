import type { Stroke } from '@shared/firestore/types';
import { cn } from '@/lib/utils';
import { FILL_CLASSES, STROKE_CLASSES, arrowHead, dashArray, isClosedShape, strokeOpacity } from '../model/markup';

interface StrokesProps {
  strokes: readonly Stroke[];
  /** Tamanho da página na tela, em pixels (as coordenadas gravadas vão de 0 a 1). */
  size: { width: number; height: number };
  faded?: boolean;
  /** Traços clicáveis (o desenho sem comentário): uma faixa invisível mais larga recebe o clique. */
  onClick?: () => void;
  label?: string;
}

/** Caixa (x, y, largura, altura) entre dois cantos opostos, em pixels. */
function boxOf(points: readonly number[], width: number, height: number) {
  const [x1 = 0, y1 = 0, x2 = 0, y2 = 0] = points;
  return { x: Math.min(x1, x2) * width, y: Math.min(y1, y2) * height, w: Math.abs(x2 - x1) * width, h: Math.abs(y2 - y1) * height };
}

function polylinePoints(points: readonly number[], width: number, height: number): string {
  const pairs: string[] = [];
  for (let i = 0; i + 1 < points.length; i += 2) pairs.push(`${points[i]! * width},${points[i + 1]! * height}`);
  return pairs.join(' ');
}

/**
 * Uma forma em SVG. `hit` desenha a versão invisível e larga que recebe o
 * clique (com preenchimento, a área inteira; sem, só a faixa do traço).
 */
function StrokeShape({ stroke, size, hit, onClick, label }: { stroke: Stroke; size: StrokesProps['size']; hit?: boolean; onClick?: () => void; label?: string }) {
  const { width, height } = size;
  const lineWidth = Math.max(0.75, stroke.width * width);
  const filled = isClosedShape(stroke.tool) && Boolean(stroke.fill);
  const common = hit
    ? {
        role: 'button',
        'aria-label': label,
        stroke: 'transparent',
        fill: filled ? 'transparent' : 'none',
        strokeWidth: Math.max(16, lineWidth + 12),
        style: { pointerEvents: (filled ? 'all' : 'stroke') as 'all' | 'stroke', cursor: 'pointer' },
        onPointerDown: (event: { stopPropagation: () => void }) => event.stopPropagation(),
        onClick: (event: { stopPropagation: () => void }) => {
          event.stopPropagation();
          onClick?.();
        },
      }
    : {
        className: cn(STROKE_CLASSES[stroke.color], filled && stroke.fill && FILL_CLASSES[stroke.fill.color]),
        fill: filled ? undefined : 'none',
        fillOpacity: filled ? stroke.fill?.opacity : undefined,
        strokeWidth: lineWidth,
        strokeOpacity: strokeOpacity(stroke),
        strokeDasharray: dashArray(stroke.dash, lineWidth),
        style: stroke.tool === 'highlighter' ? { mixBlendMode: 'multiply' as const } : undefined,
      };
  const cap = stroke.tool === 'highlighter' ? 'butt' : 'round';

  if (stroke.tool === 'rect' || stroke.tool === 'ellipse') {
    const box = boxOf(stroke.points, width, height);
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    // A rotação própria da forma é em pixels da página, em torno do centro dela.
    const transform = stroke.rotation ? `rotate(${stroke.rotation} ${cx} ${cy})` : undefined;
    return stroke.tool === 'rect' ? (
      <rect x={box.x} y={box.y} width={box.w} height={box.h} strokeLinejoin="round" transform={transform} {...common} />
    ) : (
      <ellipse cx={cx} cy={cy} rx={box.w / 2} ry={box.h / 2} transform={transform} {...common} />
    );
  }
  if (stroke.tool === 'line' || stroke.tool === 'arrow') {
    const [x1 = 0, y1 = 0, x2 = 0, y2 = 0] = stroke.points.map((value, index) => value * (index % 2 === 0 ? width : height));
    const head = stroke.tool === 'arrow' ? arrowHead(x1, y1, x2, y2, lineWidth) : null;
    return (
      <g>
        <line x1={x1} y1={y1} x2={x2} y2={y2} strokeLinecap="round" {...common} />
        {head && !hit && (
          <polygon
            points={head.map(([x, y]) => `${x},${y}`).join(' ')}
            className={cn(STROKE_CLASSES[stroke.color], FILL_CLASSES[stroke.color])}
            strokeWidth={lineWidth / 2}
            strokeLinejoin="round"
            fillOpacity={strokeOpacity(stroke)}
            strokeOpacity={strokeOpacity(stroke)}
          />
        )}
      </g>
    );
  }
  return <polyline points={polylinePoints(stroke.points, width, height)} strokeLinecap={cap} strokeLinejoin="round" {...common} />;
}

/** Traços e formas de um desenho em SVG, em pixels da página (acompanham o zoom). */
export function Strokes({ strokes, size, faded = false, onClick, label }: StrokesProps) {
  if (size.width === 0 || size.height === 0) return null;
  return (
    <svg
      viewBox={`0 0 ${size.width} ${size.height}`}
      className={cn('pointer-events-none absolute inset-0 size-full overflow-visible', faded && 'opacity-60')}
      aria-hidden={!onClick}
    >
      {strokes.map((stroke, index) => (
        <StrokeShape key={index} stroke={stroke} size={size} />
      ))}
      {onClick && strokes.map((stroke, index) => <StrokeShape key={`hit-${index}`} stroke={stroke} size={size} hit onClick={onClick} label={label} />)}
    </svg>
  );
}
