import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronUp,
  Circle,
  Highlighter,
  Italic,
  Minus,
  MoveUpRight,
  Pencil,
  RotateCcw,
  Shapes,
  SlidersHorizontal,
  Square,
  Strikethrough,
  Trash2,
  Type,
  Underline,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { useStoredToggle } from '@/hooks/use-stored-toggle';
import { useT } from '@/hooks/use-t';
import { cn } from '@/lib/utils';
import type { AnnotationColor, StrokeTool, TextAlign } from '@shared/firestore/types';
import {
  BG_CLASSES,
  LINE_STYLES,
  MARKUP_COLORS,
  MARKUP_COLOR_LABELS,
  MAX_TEXT_PT,
  MIN_TEXT_PT,
  STROKE_TOOLS,
  TEXT_ALIGNS,
  TEXT_FONTS,
  isClosedShape,
  type DrawStyle,
  type TextStyle,
} from '../model/markup';

const TOOL_ICONS: Record<StrokeTool, ReactNode> = {
  pen: <Pencil />,
  highlighter: <Highlighter />,
  line: <Minus className="-rotate-45" />,
  arrow: <MoveUpRight />,
  rect: <Square />,
  ellipse: <Circle />,
};

const ALIGN_ICONS: Record<TextAlign, ReactNode> = { left: <AlignLeft />, center: <AlignCenter />, right: <AlignRight /> };

/** Título de cada grupo de opções. */
function Field({ label, children, aside }: { label: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
        <span>{label}</span>
        {aside}
      </div>
      {children}
    </div>
  );
}

/** Botão de alternar compacto (ferramenta, negrito, alinhamento). */
function Toggle({ pressed, label, onClick, children, className }: { pressed: boolean; label: string; onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'flex h-8 min-w-0 items-center justify-center rounded-md border text-xs transition-colors [&_svg]:size-4',
        pressed ? 'border-primary bg-primary text-primary-foreground' : 'bg-background text-foreground hover:bg-muted',
        className,
      )}
    >
      {children}
    </button>
  );
}

/** As 10 cores da paleta; com `allowNone`, a primeira opção é "Sem". */
function Swatches({
  label,
  value,
  onChange,
  allowNone = false,
}: {
  label: string;
  value: AnnotationColor | null;
  onChange: (color: AnnotationColor | null) => void;
  allowNone?: boolean;
}) {
  const { t } = useT();
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1">
      {allowNone && (
        <button
          type="button"
          aria-pressed={value === null}
          aria-label={t('Sem cor')}
          title={t('Sem cor')}
          onClick={() => onChange(null)}
          className={cn(
            'relative size-5 overflow-hidden rounded-full border bg-background',
            value === null && 'ring-2 ring-ring ring-offset-1 ring-offset-background',
          )}
        >
          <span aria-hidden className="absolute left-1/2 top-[-2px] h-6 w-px -translate-x-1/2 rotate-45 bg-destructive" />
        </button>
      )}
      {MARKUP_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          aria-pressed={value === color}
          aria-label={t(MARKUP_COLOR_LABELS[color])}
          title={t(MARKUP_COLOR_LABELS[color])}
          onClick={() => onChange(color)}
          className={cn('size-5 rounded-full border border-border', BG_CLASSES[color], value === color && 'ring-2 ring-ring ring-offset-1 ring-offset-background')}
        />
      ))}
    </div>
  );
}

/** Controle deslizante com o valor ao lado. */
function Slider({ label, value, min, max, step = 1, unit, onChange }: { label: string; value: number; min: number; max: number; step?: number; unit: string; onChange: (value: number) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="sr-only">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} className="min-w-0 flex-1 accent-primary" onChange={(event) => onChange(Number(event.target.value))} />
      <span className="w-12 shrink-0 text-right tabular-nums text-muted-foreground">
        {value}
        {unit}
      </span>
    </label>
  );
}

function DrawOptions({ style, onChange }: { style: DrawStyle; onChange: (style: DrawStyle) => void }) {
  const { t } = useT();
  const closed = isClosedShape(style.tool);
  const set = (patch: Partial<DrawStyle>) => onChange({ ...style, ...patch });
  return (
    <>
      <Field label={t('Ferramenta')}>
        <div role="group" aria-label={t('Ferramenta de desenho')} className="grid grid-cols-6 gap-1">
          {STROKE_TOOLS.map((tool) => (
            <Toggle
              key={tool.id}
              pressed={style.tool === tool.id}
              label={t(tool.label)}
              onClick={() => set(tool.id === 'highlighter' && style.tool !== 'highlighter' ? { tool: tool.id, opacity: 0.4, widthPx: Math.max(style.widthPx, 12) } : { tool: tool.id })}
            >
              {TOOL_ICONS[tool.id]}
            </Toggle>
          ))}
        </div>
      </Field>
      <Field label={closed ? t('Cor da borda') : t('Cor do traço')}>
        <Swatches label={closed ? t('Cor da borda') : t('Cor do traço')} value={style.color} onChange={(color) => color && set({ color })} />
      </Field>
      <Field label={t('Espessura')}>
        <Slider label={t('Espessura')} value={style.widthPx} min={1} max={32} unit=" px" onChange={(widthPx) => set({ widthPx })} />
      </Field>
      <Field label={closed ? t('Opacidade da borda') : t('Opacidade do traço')}>
        <Slider label={t('Opacidade do traço')} value={Math.round(style.opacity * 100)} min={10} max={100} step={5} unit="%" onChange={(value) => set({ opacity: value / 100 })} />
      </Field>
      <Field label={t('Estilo da linha')}>
        <div role="group" aria-label={t('Estilo da linha')} className="grid grid-cols-3 gap-1">
          {LINE_STYLES.map((item) => (
            <Toggle key={item.id} pressed={style.dash === item.id} label={t(item.label)} onClick={() => set({ dash: item.id })}>
              <span
                aria-hidden
                className={cn(
                  'w-8 border-t-2',
                  item.id === 'dashed' && 'border-dashed',
                  item.id === 'dotted' && 'border-dotted',
                  style.dash === item.id ? 'border-primary-foreground' : 'border-foreground',
                )}
              />
            </Toggle>
          ))}
        </div>
      </Field>
      {closed && (
        <>
          <Field label={t('Preenchimento')}>
            <Swatches label={t('Cor do preenchimento')} value={style.fill} allowNone onChange={(fill) => set({ fill })} />
          </Field>
          {style.fill && (
            <Field label={t('Opacidade do preenchimento')}>
              <Slider
                label={t('Opacidade do preenchimento')}
                value={Math.round(style.fillOpacity * 100)}
                min={5}
                max={100}
                step={5}
                unit="%"
                onChange={(value) => set({ fillOpacity: value / 100 })}
              />
            </Field>
          )}
        </>
      )}
    </>
  );
}

function TextOptions({ style, onChange, rotation, onRotation }: { style: TextStyle; onChange: (style: TextStyle) => void; rotation: number | null; onRotation: (degrees: number) => void }) {
  const { t } = useT();
  const set = (patch: Partial<TextStyle>) => onChange({ ...style, ...patch });
  const clampPt = (value: number) => Math.min(MAX_TEXT_PT, Math.max(MIN_TEXT_PT, Math.round(value * 2) / 2));
  return (
    <>
      <Field label={t('Fonte')}>
        <div role="group" aria-label={t('Fonte')} className="grid grid-cols-3 gap-1">
          {TEXT_FONTS.map((font) => (
            <Toggle key={font.id} pressed={style.font === font.id} label={t(font.label)} onClick={() => set({ font: font.id })}>
              <span style={{ fontFamily: font.family }} className="text-sm">
                Aa
              </span>
            </Toggle>
          ))}
        </div>
      </Field>
      <Field label={t('Tamanho da letra')}>
        <div className="flex items-center gap-2">
          <input
            type="range"
            aria-label={t('Tamanho da letra')}
            min={MIN_TEXT_PT}
            max={MAX_TEXT_PT}
            value={style.sizePt}
            className="min-w-0 flex-1 accent-primary"
            onChange={(event) => set({ sizePt: clampPt(Number(event.target.value)) })}
          />
          <label className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
            <input
              type="number"
              aria-label={t('Tamanho da letra em pontos')}
              min={MIN_TEXT_PT}
              max={MAX_TEXT_PT}
              step={0.5}
              value={style.sizePt}
              className="h-7 w-14 rounded-md border bg-background px-1.5 text-right text-xs tabular-nums text-foreground"
              onChange={(event) => {
                const value = Number(event.target.value);
                if (Number.isFinite(value) && value > 0) set({ sizePt: clampPt(value) });
              }}
            />
            pt
          </label>
        </div>
      </Field>
      <Field label={t('Estilo e alinhamento')}>
        <div className="grid grid-cols-7 gap-1">
          <Toggle pressed={style.bold} label={t('Negrito')} onClick={() => set({ bold: !style.bold })}>
            <Bold />
          </Toggle>
          <Toggle pressed={style.italic} label={t('Itálico')} onClick={() => set({ italic: !style.italic })}>
            <Italic />
          </Toggle>
          <Toggle pressed={style.underline} label={t('Sublinhado')} onClick={() => set({ underline: !style.underline })}>
            <Underline />
          </Toggle>
          <Toggle pressed={style.strike} label={t('Tachado')} onClick={() => set({ strike: !style.strike })}>
            <Strikethrough />
          </Toggle>
          {TEXT_ALIGNS.map((align) => (
            <Toggle key={align.id} pressed={style.align === align.id} label={t(align.label)} onClick={() => set({ align: align.id })}>
              {ALIGN_ICONS[align.id]}
            </Toggle>
          ))}
        </div>
      </Field>
      <Field label={t('Cor do texto')}>
        <Swatches label={t('Cor do texto')} value={style.color} onChange={(color) => color && set({ color })} />
      </Field>
      <Field label={t('Opacidade do texto')}>
        <Slider label={t('Opacidade do texto')} value={Math.round(style.opacity * 100)} min={10} max={100} step={5} unit="%" onChange={(value) => set({ opacity: value / 100 })} />
      </Field>
      <Field label={t('Fundo da caixa')}>
        <Swatches
          label={t('Fundo da caixa')}
          value={style.background?.color ?? null}
          allowNone
          onChange={(color) => set({ background: color ? { color, opacity: style.background?.opacity ?? 0.6 } : null })}
        />
      </Field>
      {style.background && (
        <Field label={t('Opacidade do fundo')}>
          <Slider
            label={t('Opacidade do fundo')}
            value={Math.round(style.background.opacity * 100)}
            min={5}
            max={100}
            step={5}
            unit="%"
            onChange={(value) => style.background && set({ background: { ...style.background, opacity: value / 100 } })}
          />
        </Field>
      )}
      <Field label={t('Borda da caixa')}>
        <Swatches label={t('Borda da caixa')} value={style.border} allowNone onChange={(border) => set({ border })} />
      </Field>
      {rotation !== null && (
        <Field
          label={t('Rotação')}
          aside={
            rotation !== 0 && (
              <button type="button" className="flex items-center gap-1 text-xs font-normal hover:text-foreground [&_svg]:size-3.5" onClick={() => onRotation(0)}>
                <RotateCcw />
                {t('Zerar')}
              </button>
            )
          }
        >
          <Slider label={t('Rotação')} value={Math.round(rotation)} min={-180} max={180} unit="°" onChange={onRotation} />
        </Field>
      )}
    </>
  );
}

interface MarkupPanelProps {
  mode: 'draw' | 'write';
  drawStyle: DrawStyle;
  onDrawStyle: (style: DrawStyle) => void;
  textStyle: TextStyle;
  onTextStyle: (style: TextStyle) => void;
  /** Caixa de texto escolhida: a rotação dela e excluir. */
  activeText: { rotation: number; onRotation: (degrees: number) => void; onDelete: () => void } | null;
  /** Editando uma marcação já gravada: salvar e cancelar ficam aqui. */
  editing: { onSave: () => void; onCancel: () => void; canSave: boolean } | null;
  /** Recolhido enquanto a pessoa não escolheu (no celular, para não cobrir a página). */
  defaultCollapsed?: boolean;
}

/**
 * Painel flutuante no canto superior direito do PDF, recolhível: as opções
 * do desenho (ferramenta, cores, espessura, opacidade, linha e preenchimento)
 * ou do texto (fonte, tamanho, estilo, cores, fundo, borda e rotação).
 */
export function MarkupPanel({ mode, drawStyle, onDrawStyle, textStyle, onTextStyle, activeText, editing, defaultCollapsed = false }: MarkupPanelProps) {
  const { t } = useT();
  const [stored, setCollapsed] = useStoredToggle('overdoctex.markup-panel-collapsed');
  const collapsed = stored ?? defaultCollapsed;
  const title = mode === 'draw' ? t('Desenho') : t('Texto');
  const icon = mode === 'draw' ? <Shapes /> : <Type />;

  const footer = editing && (
    <div className="flex gap-2 border-t p-3">
      <Button size="sm" className="flex-1" disabled={!editing.canSave} onClick={editing.onSave}>
        {t('Salvar alterações')}
      </Button>
      <Button size="sm" variant="outline" onClick={editing.onCancel}>
        {t('Cancelar')}
      </Button>
    </div>
  );

  if (collapsed) {
    return (
      <div className="pointer-events-auto flex flex-col items-end gap-2">
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 bg-background/95 shadow-md"
          aria-expanded={false}
          aria-label={t('Mostrar as opções de {tool}', { tool: title.toLowerCase() })}
          onClick={() => setCollapsed(false)}
        >
          <SlidersHorizontal />
          {title}
        </Button>
        {footer && <div className="w-56 rounded-lg border bg-background/95 shadow-md">{footer}</div>}
      </div>
    );
  }

  return (
    <section
      aria-label={t('Opções de {tool}', { tool: title.toLowerCase() })}
      className="pointer-events-auto flex max-h-full w-64 max-w-[calc(100vw-2rem)] select-none flex-col rounded-lg border bg-background/95 shadow-lg backdrop-blur"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <header className="flex h-10 shrink-0 items-center gap-2 border-b pl-3 pr-1 text-sm font-medium [&>svg]:size-4 [&>svg]:text-muted-foreground">
        {icon}
        <span className="min-w-0 flex-1 truncate">{title}</span>
        <Button variant="ghost" size="icon" className="size-8" aria-expanded aria-label={t('Recolher as opções')} title={t('Recolher as opções')} onClick={() => setCollapsed(true)}>
          <ChevronUp />
        </Button>
      </header>
      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto p-3">
        {mode === 'draw' ? (
          <DrawOptions style={drawStyle} onChange={onDrawStyle} />
        ) : (
          <>
            {!activeText && <p className="text-xs text-muted-foreground">{t('Clique na página para criar uma caixa de texto. Os ajustes valem para a caixa escolhida e para as próximas.')}</p>}
            <TextOptions style={textStyle} onChange={onTextStyle} rotation={activeText?.rotation ?? null} onRotation={(degrees) => activeText?.onRotation(degrees)} />
            {activeText && (
              <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={activeText.onDelete}>
                <Trash2 />
                {t('Excluir o texto')}
              </Button>
            )}
          </>
        )}
      </div>
      {footer}
    </section>
  );
}
