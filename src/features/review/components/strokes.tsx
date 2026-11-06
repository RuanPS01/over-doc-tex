import type { AnnotationColor, Stroke } from '@shared/firestore/types';
import { svgPoints } from '@/lib/pdf/drawing';
import { cn } from '@/lib/utils';

/** Classes inteiras (o Tailwind só gera o que aparece escrito no código). */
const STROKE_CLASSES: Record<AnnotationColor, string> = {
  'annotation-1': 'stroke-annotation-1',
  'annotation-2': 'stroke-annotation-2',
  'annotation-3': 'stroke-annotation-3',
  'annotation-4': 'stroke-annotation-4',
};

interface StrokesProps {
  strokes: readonly Stroke[];
  faded?: boolean;
  /** Traços clicáveis (o desenho sem comentário): uma faixa invisível mais larga recebe o clique. */
  onClick?: () => void;
  label?: string;
}

/** Traços de um desenho em SVG, em coordenadas de 0 a 1 da página (acompanham o zoom). */
export function Strokes({ strokes, faded = false, onClick, label }: StrokesProps) {
  return (
    <svg viewBox="0 0 1 1" preserveAspectRatio="none" className={cn('pointer-events-none absolute inset-0 size-full', faded && 'opacity-60')} aria-hidden={!onClick}>
      {strokes.map((stroke, index) => (
        <polyline
          key={index}
          points={svgPoints(stroke.points)}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          className={STROKE_CLASSES[stroke.color]}
          style={{ strokeWidth: 3 }}
        />
      ))}
      {onClick &&
        strokes.map((stroke, index) => (
          <polyline
            key={`hit-${index}`}
            role="button"
            aria-label={label}
            points={svgPoints(stroke.points)}
            fill="none"
            stroke="transparent"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            // Só o traço (com folga) recebe o clique; o resto da página continua livre para selecionar texto.
            style={{ strokeWidth: 16, pointerEvents: 'stroke', cursor: 'pointer' }}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onClick();
            }}
          />
        ))}
    </svg>
  );
}
