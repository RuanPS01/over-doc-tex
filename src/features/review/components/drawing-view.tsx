import type { Stroke, TextBox } from '@shared/firestore/types';
import { Strokes } from './strokes';
import { TextBoxView } from './text-box-view';

interface DrawingViewProps {
  strokes: readonly Stroke[];
  texts?: readonly TextBox[];
  size: { width: number; height: number };
  faded?: boolean;
  /** Desenho sem comentário em "Selecionar texto": clicar no traço ou no texto seleciona. */
  onClick?: () => void;
  label?: string;
}

/** Traços e formas por baixo, textos flutuantes por cima. */
export function DrawingView({ strokes, texts = [], size, faded = false, onClick, label }: DrawingViewProps) {
  return (
    <>
      <Strokes strokes={strokes} size={size} faded={faded} onClick={onClick} label={label} />
      {texts.map((box, index) => (
        <TextBoxView key={index} box={box} pageWidth={size.width} faded={faded} onClick={onClick} label={label} />
      ))}
    </>
  );
}
