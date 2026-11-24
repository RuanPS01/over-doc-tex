import type { CSSProperties } from 'react';
import type { TextBox } from '@shared/firestore/types';
import { cn } from '@/lib/utils';
import { BG_CLASSES, BORDER_CLASSES, TEXT_BORDER_FRACTION, TEXT_CLASSES, TEXT_LINE_HEIGHT, TEXT_PADDING, fontFamilyOf } from '../model/markup';

/** Posição da caixa (antes da rotação) e a rotação em torno do centro, em porcentagem da página. */
export function boxFrameStyle(box: Pick<TextBox, 'rect' | 'rotation'>): CSSProperties {
  return {
    left: `${box.rect.x * 100}%`,
    top: `${box.rect.y * 100}%`,
    width: `${box.rect.width * 100}%`,
    height: `${box.rect.height * 100}%`,
    transform: box.rotation ? `rotate(${box.rotation}deg)` : undefined,
    transformOrigin: 'center',
  };
}

/** Letra, tamanho e espaçamento do texto, em pixels da página na tela. */
export function textStyleOf(box: TextBox, pageWidth: number): CSSProperties {
  const fontSize = box.size * pageWidth;
  const decorations = [box.underline && 'underline', box.strike && 'line-through'].filter(Boolean).join(' ');
  return {
    fontFamily: fontFamilyOf(box.font),
    fontSize,
    lineHeight: TEXT_LINE_HEIGHT,
    padding: fontSize * TEXT_PADDING,
    fontWeight: box.bold ? 700 : 400,
    fontStyle: box.italic ? 'italic' : 'normal',
    textDecorationLine: decorations || 'none',
    textAlign: box.align,
    opacity: box.opacity,
  };
}

/** Fundo e borda da caixa, atrás do texto (o fundo tem opacidade própria). */
export function TextBoxBackdrop({ box, pageWidth }: { box: TextBox; pageWidth: number }) {
  return (
    <>
      {box.background && (
        <span aria-hidden className={cn('absolute inset-0', BG_CLASSES[box.background.color])} style={{ opacity: box.background.opacity }} />
      )}
      {box.border && (
        <span
          aria-hidden
          className={cn('absolute inset-0 border-solid', BORDER_CLASSES[box.border])}
          style={{ borderWidth: Math.max(1, TEXT_BORDER_FRACTION * pageWidth) }}
        />
      )}
    </>
  );
}

interface TextBoxViewProps {
  box: TextBox;
  pageWidth: number;
  faded?: boolean;
  /** Clicável (desenho sem comentário em "Selecionar texto", ou a caixa do rascunho em "Texto"). */
  onClick?: () => void;
  onDoubleClick?: () => void;
  label?: string;
}

/** Texto flutuante gravado ou do rascunho, sem edição: a caixa girada com fundo, borda e o texto. */
export function TextBoxView({ box, pageWidth, faded = false, onClick, onDoubleClick, label }: TextBoxViewProps) {
  if (pageWidth === 0) return null;
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      aria-label={onClick ? label : undefined}
      aria-hidden={onClick ? undefined : true}
      style={boxFrameStyle(box)}
      className={cn('absolute block p-0 text-left', onClick ? 'pointer-events-auto cursor-pointer' : 'pointer-events-none', faded && 'opacity-60')}
      onPointerDown={onClick ? (event) => event.stopPropagation() : undefined}
      onClick={
        onClick
          ? (event) => {
              event.stopPropagation();
              onClick();
            }
          : undefined
      }
      onDoubleClick={
        onDoubleClick
          ? (event) => {
              event.stopPropagation();
              onDoubleClick();
            }
          : undefined
      }
    >
      <TextBoxBackdrop box={box} pageWidth={pageWidth} />
      <span
        className={cn('relative block size-full whitespace-pre-wrap break-words [overflow-wrap:anywhere]', TEXT_CLASSES[box.color])}
        style={textStyleOf(box, pageWidth)}
      >
        {box.text}
      </span>
    </Tag>
  );
}
