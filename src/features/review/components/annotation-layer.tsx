import { useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import type { Drawing, NormalizedPoint, Stroke, TextBox } from '@shared/firestore/types';
import { useElementSize } from '@/hooks/use-element-size';
import { useT } from '@/hooks/use-t';
import { movePin } from '@/lib/pdf/drawing';
import { cn } from '@/lib/utils';
import { usePinDrag } from '../hooks/use-pin-drag';
import { constrainEnd, strokeFromInput, styledStroke, type DrawStyle } from '../model/markup';
import type { PendingAnnotation, ReviewTool, ThreadSummary } from '../model/review';
import { DrawingMark } from './drawing-mark';
import { DrawingView } from './drawing-view';
import { Strokes } from './strokes';
import { TextBoxEditor } from './text-box-editor';
import { TextBoxView } from './text-box-view';

interface AnnotationLayerProps {
  page: number;
  /** Threads desta página, com o número exibido. */
  threads: Array<{ thread: ThreadSummary; number: number }>;
  /** Desenhos sem comentário desta página (sem número). */
  drawings: ThreadSummary[];
  pending: PendingAnnotation | null;
  tool: ReviewTool;
  selectedThreadId: string | null;
  selectedDrawingId: string | null;
  onPlacePin: (page: number, point: { x: number; y: number }) => void;
  /** Um traço começou (verdadeiro) ou acabou, valendo ou não (falso): o salvamento automático da remarcação espera. */
  onStrokingChange?: (active: boolean) => void;
  /** Ferramenta, cores e espessura do desenho (painel "Desenho"). */
  drawStyle: DrawStyle;
  /** Traço ou forma terminada, já no formato gravado. */
  onStroke: (page: number, stroke: Stroke) => void;
  /** Caixa de texto do rascunho em edição (ferramenta "Texto"). */
  activeTextIndex: number | null;
  /** Clique num lugar vazio com "Texto": caixa nova aqui. */
  onTextCreate: (page: number, point: NormalizedPoint) => void;
  /** Escolhe outra caixa do rascunho (ou nenhuma). */
  onTextSelect: (index: number | null) => void;
  onTextChange: (index: number, box: TextBox) => void;
  /** Abre um desenho gravado para editar. */
  onEditDrawing: (thread: ThreadSummary) => void;
  /** Edita ali mesmo o texto de um desenho gravado (clique com "Texto", duplo clique na seleção). */
  onEditText: (thread: ThreadSummary) => void;
  /** Desenho selecionado arrastado, girado ou redimensionado. */
  onTransformDrawing: (thread: ThreadSummary, drawing: Drawing) => void;
  /** Estilo do desenho selecionado mudado no painel e ainda não gravado. */
  drawingPreview: { threadId: string; drawing: Drawing } | null;
  onSelect: (threadId: string) => void;
  onSelectDrawing: (threadId: string) => void;
  /** Pins (com ou sem desenho) que a pessoa pode arrastar, e desenhos que ela pode apagar: quem criou ou edita o projeto. */
  canMove: (thread: ThreadSummary) => boolean;
  /** Pin solto em outro lugar da página (o desenho vai junto). */
  onMovePin: (thread: ThreadSummary, point: NormalizedPoint) => Promise<unknown>;
  onDeleteDrawing: (thread: ThreadSummary) => Promise<unknown>;
  /** Thread esperando a marcação nova: a marcação atual sai do PDF (volta se a remarcação for cancelada). */
  relocatingThreadId: string | null;
}

const clamp = (value: number) => Math.min(1, Math.max(0, value));

/**
 * Tudo que fica sobre a página, em coordenadas de 0 a 1 (acompanha o zoom
 * sem recalcular nada): destaques dos trechos, desenhos, pins numerados e a
 * marcação pendente. Com "Ponto", o clique posiciona o pin; com "Desenhar",
 * o ponteiro desenha (touch-action: none só aqui, para não travar a rolagem
 * fora do modo de desenho). Em "Selecionar", a camada deixa o clique passar
 * para a camada de texto.
 */
export function AnnotationLayer({
  page,
  threads,
  drawings,
  pending,
  tool,
  selectedThreadId,
  selectedDrawingId,
  onPlacePin,
  onStrokingChange,
  drawStyle,
  onStroke,
  activeTextIndex,
  onTextCreate,
  onTextSelect,
  onTextChange,
  onEditDrawing,
  onEditText,
  onTransformDrawing,
  drawingPreview,
  onSelect,
  onSelectDrawing,
  canMove,
  onMovePin,
  onDeleteDrawing,
  relocatingThreadId,
}: AnnotationLayerProps) {
  const { t } = useT();
  const rootRef = useRef<HTMLDivElement>(null);
  const pinDrag = usePinDrag(rootRef, (threadId, point) => {
    const thread = threads.find((item) => item.thread.id === threadId)?.thread;
    return thread ? onMovePin(thread, point) : Promise.resolve();
  });
  const size = useElementSize(rootRef);
  const aspect = size.width > 0 ? size.height / size.width : 1;
  const [live, setLive] = useState<Array<[number, number]> | null>(null);
  const liveRef = useRef<Array<[number, number]> | null>(null);
  const freehand = drawStyle.tool === 'pen' || drawStyle.tool === 'highlighter';

  const pointOf = (event: PointerEvent<HTMLDivElement>): [number, number] => {
    const box = event.currentTarget.getBoundingClientRect();
    return [clamp((event.clientX - box.left) / box.width), clamp((event.clientY - box.top) / box.height)];
  };

  /** Ponteiro em pixels da página (para as alças da caixa de texto). */
  const toPage = (clientX: number, clientY: number): [number, number] => {
    const box = rootRef.current?.getBoundingClientRect();
    return box ? [clientX - box.left, clientY - box.top] : [0, 0];
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const [x, y] = pointOf(event);
    const point = { x: Math.round(x * 10_000) / 10_000, y: Math.round(y * 10_000) / 10_000 };
    if (tool === 'pin') {
      onPlacePin(page, point);
      return;
    }
    if (tool !== 'draw') return;
    onStrokingChange?.(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    liveRef.current = [[x, y]];
    setLive(liveRef.current);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (tool !== 'draw' || !liveRef.current) return;
    const point = pointOf(event);
    // Forma: só o começo e o ponto atual (com Shift, quadrado, círculo ou 45 graus).
    liveRef.current = freehand ? [...liveRef.current, point] : [liveRef.current[0]!, event.shiftKey ? constrainEnd(drawStyle.tool, liveRef.current[0]!, point, aspect) : point];
    setLive(liveRef.current);
  };

  /**
   * "Texto": o toque (clique) num lugar vazio cria a caixa; no celular, começar a rolar a página não
   * cria nada. Com uma caixa em edição, o clique fora só termina a edição; o próximo cria outra.
   */
  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (tool !== 'write') return;
    if (activeTextIndex !== null) {
      onTextSelect(null);
      return;
    }
    const box = event.currentTarget.getBoundingClientRect();
    const round = (value: number) => Math.round(clamp(value) * 10_000) / 10_000;
    onTextCreate(page, { x: round((event.clientX - box.left) / box.width), y: round((event.clientY - box.top) / box.height) });
  };

  const finishStroke = () => {
    const points = liveRef.current;
    liveRef.current = null;
    setLive(null);
    if (points) onStrokingChange?.(false);
    const stroke = points ? strokeFromInput(drawStyle, points) : null;
    if (stroke) onStroke(page, stroke);
  };

  // Prévia do traço em andamento, com o estilo escolhido (sem simplificar).
  const liveStroke: Stroke | null = live ? styledStroke(drawStyle, freehand ? live.flat() : [...live[0]!, ...live.at(-1)!]) : null;
  const draft = pending?.kind === 'draw' && pending.page === page ? pending : null;

  return (
    <div
      ref={rootRef}
      data-annotation-layer
      className={cn(
        'absolute inset-0 z-10',
        tool === 'select' && 'pointer-events-none',
        tool === 'pin' && 'cursor-crosshair',
        tool === 'draw' && 'cursor-crosshair touch-none',
        tool === 'write' && 'cursor-text',
      )}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishStroke}
      onPointerCancel={finishStroke}
      onClick={handleClick}
    >
      {drawings.map((thread) =>
        thread.id === relocatingThreadId ? null : (
          <DrawingMark
            key={thread.id}
            thread={thread}
            size={size}
            preview={drawingPreview?.threadId === thread.id ? drawingPreview.drawing : null}
            isSelected={thread.id === selectedDrawingId}
            isInteractive={tool === 'select'}
            canManage={canMove(thread)}
            onSelect={() => onSelectDrawing(thread.id)}
            onDelete={() => onDeleteDrawing(thread)}
            onEdit={() => onEditDrawing(thread)}
            // Com "Texto", clicar num texto gravado (de quem pode mexer nele) edita o texto ali mesmo.
            onEditText={(tool === 'write' || tool === 'select') && canMove(thread) && thread.anchor.type === 'pin' && thread.anchor.drawing?.texts?.length ? () => onEditText(thread) : undefined}
            onTransform={(drawing) => onTransformDrawing(thread, drawing)}
          />
        ),
      )}
      {threads.map(({ thread, number }) => {
        // Trecho que não foi reencontrado na versão nova não tem lugar nesta página; a marcação em
        // remarcação já saiu (a nova vem no lugar dela).
        if (thread.status === 'outdated' || thread.id === relocatingThreadId) return null;
        const isResolved = thread.status === 'resolved';
        const isSelected = thread.id === selectedThreadId;
        // Semitransparente para não tampar o texto embaixo; fica opaco no hover, no foco e quando selecionado.
        const badge = cn(
          'pointer-events-auto absolute flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-xs font-semibold shadow-sm transition-[transform,opacity] hover:opacity-100 focus-visible:opacity-100',
          isResolved ? 'border bg-muted text-foreground opacity-45' : 'bg-annotation-3 text-background opacity-60',
          isSelected && 'scale-125 opacity-100 ring-2 ring-ring ring-offset-2',
        );
        const select = (event: { stopPropagation: () => void }) => {
          event.stopPropagation();
          // Soltar o pin depois de arrastar não conta como clique.
          if (pinDrag.consumeClick()) return;
          onSelect(thread.id);
        };
        if (thread.anchor.type === 'text') {
          const first = thread.anchor.rects[0];
          return (
            <div key={thread.id}>
              {thread.anchor.rects.map((rect, index) => (
                <span
                  key={index}
                  aria-hidden
                  style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` }}
                  className={cn('absolute rounded-sm mix-blend-multiply', isSelected ? 'bg-annotation-1/60' : 'bg-annotation-1/35', isResolved && 'bg-muted/60')}
                />
              ))}
              {first && (
                <button
                  type="button"
                  aria-label={t('Comentário {number}', { number })}
                  style={{ left: `${first.x * 100}%`, top: `${first.y * 100}%` }}
                  className={badge}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={select}
                >
                  {number}
                </button>
              )}
            </div>
          );
        }
        // Pin arrastável: o ponto e o desenho seguem o ponteiro enquanto ele é arrastado.
        const movable = canMove(thread);
        const isDragging = pinDrag.drag?.threadId === thread.id;
        const shown = isDragging ? movePin(thread.anchor.point, thread.anchor.drawing, pinDrag.drag!.point) : thread.anchor;
        return (
          <div key={thread.id}>
            {shown.drawing && <DrawingView strokes={shown.drawing.strokes} texts={shown.drawing.texts} size={size} faded={isResolved} />}
            <button
              type="button"
              aria-label={t('Comentário {number}', { number })}
              title={movable ? t('Clique para abrir; arraste para mudar de lugar') : undefined}
              style={{ left: `${shown.point.x * 100}%`, top: `${shown.point.y * 100}%` }}
              className={cn(badge, movable && 'cursor-grab touch-none active:cursor-grabbing', isDragging && 'scale-110 cursor-grabbing opacity-100 shadow-md')}
              {...(movable ? pinDrag.bind(thread.id, thread.anchor.point) : { onPointerDown: (event: PointerEvent<HTMLButtonElement>) => event.stopPropagation() })}
              onClick={select}
            >
              {number}
            </button>
          </div>
        );
      })}

      {pending?.kind === 'pin' && pending.page === page && (
        <span
          aria-hidden
          style={{ left: `${pending.point.x * 100}%`, top: `${pending.point.y * 100}%` }}
          className="absolute size-7 -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full border-2 border-annotation-3 bg-annotation-3/30"
        />
      )}
      {pending?.kind === 'text' &&
        pending.anchor.page === page &&
        pending.anchor.rects.map((rect, index) => (
          <span
            key={index}
            aria-hidden
            style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` }}
            className="absolute animate-pulse rounded-sm bg-annotation-3/30"
          />
        ))}
      {draft && <Strokes strokes={draft.strokes} size={size} />}
      {draft?.texts.map((box, index) =>
        tool === 'write' && index === activeTextIndex ? (
          <TextBoxEditor
            key={index}
            box={box}
            size={size}
            toPage={toPage}
            autoFocus
            onChange={(next) => onTextChange(index, next)}
            onDone={() => onTextSelect(null)}
          />
        ) : (
          <TextBoxView
            key={index}
            box={box}
            pageWidth={size.width}
            onClick={tool === 'write' ? () => onTextSelect(index) : undefined}
            label={t('Editar este texto')}
          />
        ),
      )}
      {liveStroke && <Strokes strokes={[liveStroke]} size={size} />}
    </div>
  );
}
