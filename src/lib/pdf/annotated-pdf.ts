import type { PDFDocument, PDFFont, PDFPage } from 'pdf-lib';
import type { AnnotationColor, NormalizedRect, ThreadAnchor } from '@shared/firestore/types';
import type { RgbColor } from '@/lib/color';
import { ellipsize, layoutMarginBoxes, markdownToPlainText, wrapText } from './comment-layout';

/**
 * PDF da revisão com as marcações e os comentários (opção "PDF com anotações"
 * do download). Gerado no navegador com o pdf-lib, por cima do PDF original
 * da versão, que continua vetorial, com texto selecionável, links e índice:
 *
 * - cada página ganha uma margem à direita com os comentários em cartões,
 *   como os balões do Word, cada um na altura da sua marcação;
 * - destaques dos trechos, desenhos e pins numerados ficam na página, os pins
 *   semitransparentes para não tampar o texto;
 * - um comentário que não cabe na margem é encurtado, e o PDF ganha no fim as
 *   páginas "Comentários completos", com todas as conversas inteiras.
 *
 * As coordenadas das marcações são de 0 a 1 sobre a página como o pdf.js a
 * mostra (área visível e rotação já aplicadas); a matriz de `pageGeometry`
 * leva esse espaço ao espaço do PDF, então páginas giradas também funcionam.
 */

export interface AnnotatedPdfComment {
  author: string;
  /** Data já formatada no idioma da interface. */
  date: string;
  /** Markdown, como gravado; vira texto simples no PDF. */
  body: string;
}

export interface AnnotatedPdfThread {
  /** O mesmo número do pin na tela. */
  number: number;
  anchor: ThreadAnchor;
  /** Desatualizada: o trecho não existe nesta versão, então não há marcação na página. */
  state: 'open' | 'resolved' | 'outdated';
  /** "Trecho", "Ponto" ou "Desenho", já traduzido. */
  kindLabel: string;
  /** "Resolvida", "Corrigida", "Desatualizada"; vazio na thread aberta. */
  statusLabel: string;
  /** Conversa da rodada anterior (thread levada adiante). */
  previousRound: AnnotatedPdfComment[];
  comments: AnnotatedPdfComment[];
  /** Desenho sem comentário: só o traço na página, sem pin nem cartão. */
  markOnly?: boolean;
}

/** Textos já traduzidos (o PDF fica no idioma de quem baixou). */
export interface AnnotatedPdfText {
  /** Topo da margem de cada página, ex.: "Revisão #2 · versão 1.3". */
  heading: string;
  summaryTitle: string;
  continued: string;
  previousRound: string;
  page: (page: number) => string;
  hiddenOnPage: (count: number) => string;
}

/** Cores lidas dos tokens (--export-* e --annotation-*), para papel branco nos dois temas. */
export interface AnnotatedPdfPalette {
  ink: RgbColor;
  muted: RgbColor;
  rule: RgbColor;
  panel: RgbColor;
  paper: RgbColor;
  pinText: RgbColor;
  annotation: Record<AnnotationColor, RgbColor>;
}

export interface AnnotatedPdfInput {
  threads: readonly AnnotatedPdfThread[];
  text: AnnotatedPdfText;
  palette: AnnotatedPdfPalette;
}

export interface PdfBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Matrix = [number, number, number, number, number, number];

export interface PageGeometry {
  /** Largura e altura da página como aparece (com a rotação). */
  width: number;
  height: number;
  /** Do espaço da página como aparece (origem embaixo à esquerda) para o espaço do PDF. */
  matrix: Matrix;
}

/** Margem de comentários: cerca de 40% da página, entre 180 e 300 pontos. */
export function marginWidthFor(pageWidth: number): number {
  return Math.round(Math.min(300, Math.max(180, pageWidth * 0.42)));
}

/**
 * Geometria da página como o pdf.js mostra: área visível (`view`) girada no
 * sentido horário por /Rotate. A matriz faz o caminho inverso, da página
 * mostrada (y para cima) para o espaço do PDF.
 */
export function pageGeometry(view: PdfBox, rotation: number): PageGeometry {
  const angle = (((Math.round(rotation / 90) * 90) % 360) + 360) % 360;
  const quarter = angle === 90 || angle === 270;
  const width = quarter ? view.height : view.width;
  const height = quarter ? view.width : view.height;
  const radians = (angle * Math.PI) / 180;
  const cos = Math.round(Math.cos(radians));
  const sin = Math.round(Math.sin(radians));
  const centerX = view.x + view.width / 2;
  const centerY = view.y + view.height / 2;
  const e = centerX - (cos * (width / 2) - sin * (height / 2));
  const f = centerY - (sin * (width / 2) + cos * (height / 2));
  return { width, height, matrix: [cos, sin, -sin, cos, e, f] };
}

export function applyMatrix([a, b, c, d, e, f]: Matrix, x: number, y: number): [number, number] {
  return [a * x + c * y + e, b * x + d * y + f];
}

/** Área visível da página com a margem acrescentada à direita da página mostrada, no espaço do PDF. */
export function extendedView(geometry: PageGeometry, margin: number): PdfBox {
  const corners = [
    applyMatrix(geometry.matrix, 0, 0),
    applyMatrix(geometry.matrix, geometry.width + margin, 0),
    applyMatrix(geometry.matrix, 0, geometry.height),
    applyMatrix(geometry.matrix, geometry.width + margin, geometry.height),
  ];
  const xs = corners.map(([x]) => x);
  const ys = corners.map(([, y]) => y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

function intersect(a: PdfBox, b: PdfBox): PdfBox {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const top = Math.min(a.y + a.height, b.y + b.height);
  return right > x && top > y ? { x, y, width: right - x, height: top - y } : a;
}

function union(a: PdfBox, b: PdfBox): PdfBox {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
}

// Medidas em pontos (1/72 de polegada).
const PANEL_PADDING = 8;
const BOX_PADDING = 5;
const BOX_GAP = 6;
const ACCENT_WIDTH = 2;
const PIN_RADIUS = 6.5;
const BADGE_RADIUS = 4.6;
/** Opacidade dos pins e dos números sobre a página: o texto embaixo continua legível. */
const PIN_OPACITY = 0.55;
const HIGHLIGHT_OPACITY = 0.35;
const SIZE = { heading: 6.5, header: 6.8, quote: 6.6, author: 6.8, date: 6.2, body: 7.2, continued: 6.3 } as const;
const LINE = { header: 12, quote: 8.8, author: 9.6, body: 9.2, label: 9, continued: 9 } as const;

type FontKind = 'regular' | 'bold' | 'italic';
type Tone = 'ink' | 'muted';

interface Segment {
  text: string;
  font: FontKind;
  tone: Tone;
  size: number;
}

interface BoxLine {
  segments: Segment[];
  height: number;
  indent: number;
  /** Linha da citação do trecho (barra amarela à esquerda). */
  isQuote?: boolean;
  /** Cabeçalho: número, tipo e status. */
  header?: { status: string };
}

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
}

interface Context {
  lib: typeof import('pdf-lib');
  fonts: Fonts;
  /** Troca o que a fonte padrão (WinAnsi) não desenha: sem isso o pdf-lib lança erro. */
  encode: (text: string) => string;
  input: AnnotatedPdfInput;
}

/** Espaços estreitos e hifens tipográficos que a codificação WinAnsi não tem. */
const REPLACEMENTS: Record<number, string> = { 0x2010: '-', 0x2011: '-', 0x2212: '-', 0x2009: ' ', 0x200a: ' ', 0x202f: ' ', 0x200b: '' };

export function makeEncoder(supported: ReadonlySet<number>): (text: string) => string {
  return (text) => {
    let result = '';
    for (const char of text.normalize('NFC')) {
      const code = char.codePointAt(0)!;
      if (char === '\n') result += char;
      else if (char === '\t') result += ' ';
      else if (code < 0x20) continue;
      else if (supported.has(code)) result += char;
      else if (REPLACEMENTS[code] !== undefined) result += REPLACEMENTS[code];
      else {
        // Letra com acento fora da tabela ("ő"): fica a letra base.
        const base = char.normalize('NFD').replace(/\p{M}/gu, '');
        result += base && [...base].every((part) => supported.has(part.codePointAt(0)!)) ? base : '?';
      }
    }
    return result;
  };
}

/** Cor do token no formato do pdf-lib (os valores vêm dos tokens, nunca de cor escrita no código). */
function colorOf(ctx: Context, color: RgbColor) {
  return ctx.lib.componentsToColor([color.r, color.g, color.b])!;
}

function measure(ctx: Context, font: FontKind, size: number) {
  return (text: string) => ctx.fonts[font].widthOfTextAtSize(text, size);
}

function threadColor(ctx: Context, thread: AnnotatedPdfThread): RgbColor {
  const { palette } = ctx.input;
  if (thread.state === 'resolved') return palette.muted;
  if (thread.state === 'outdated') return palette.annotation['annotation-1'];
  return palette.annotation['annotation-3'];
}

/** Linhas do cartão de uma thread, já quebradas na largura dele. */
function buildLines(ctx: Context, thread: AnnotatedPdfThread, width: number): BoxLine[] {
  const lines: BoxLine[] = [
    {
      segments: [{ text: ctx.encode(thread.kindLabel), font: 'regular', tone: 'muted', size: SIZE.header }],
      height: LINE.header,
      indent: BADGE_RADIUS * 2 + 4,
      header: { status: ctx.encode(thread.statusLabel) },
    },
  ];
  if (thread.anchor.type === 'text') {
    const quote = ctx.encode(thread.anchor.quote.exact.replace(/\s+/g, ' ').trim());
    const quoteWidth = width - 5;
    const wrapped = wrapText(quote, quoteWidth, measure(ctx, 'italic', SIZE.quote));
    const shown = wrapped.slice(0, 2);
    if (wrapped.length > 2) shown[1] = ellipsize(`${shown[1]} ${wrapped.slice(2).join(' ')}`, quoteWidth, measure(ctx, 'italic', SIZE.quote));
    for (const text of shown) lines.push({ segments: [{ text, font: 'italic', tone: 'muted', size: SIZE.quote }], height: LINE.quote, indent: 5, isQuote: true });
  }
  const addComments = (comments: readonly AnnotatedPdfComment[], tone: Tone) => {
    comments.forEach((comment, index) => {
      lines.push({
        segments: [
          { text: ctx.encode(comment.author), font: 'bold', tone, size: SIZE.author },
          { text: comment.date ? `  ${ctx.encode(comment.date)}` : '', font: 'regular', tone: 'muted', size: SIZE.date },
        ],
        height: LINE.author + (index > 0 || lines.length > 1 ? 2 : 0),
        indent: 0,
      });
      const body = ctx.encode(markdownToPlainText(comment.body));
      for (const text of wrapText(body, width, measure(ctx, 'regular', SIZE.body))) {
        lines.push({ segments: [{ text, font: 'regular', tone, size: SIZE.body }], height: LINE.body, indent: 0 });
      }
    });
  };
  if (thread.previousRound.length > 0) {
    lines.push({ segments: [{ text: ctx.encode(ctx.input.text.previousRound), font: 'bold', tone: 'muted', size: SIZE.continued }], height: LINE.label + 2, indent: 0 });
    addComments(thread.previousRound, 'muted');
  }
  addComments(thread.comments, 'ink');
  return lines;
}

/** Escreve os segmentos de uma linha lado a lado, cortando o que passar da largura. */
function drawSegments(ctx: Context, page: PDFPage, segments: readonly Segment[], x: number, baseline: number, maxWidth: number) {
  const { palette } = ctx.input;
  let cursor = x;
  for (const segment of segments) {
    if (!segment.text) continue;
    const room = x + maxWidth - cursor;
    if (room <= 4) break;
    const text = ellipsize(segment.text, room, measure(ctx, segment.font, segment.size));
    page.drawText(text, {
      x: cursor,
      y: baseline,
      size: segment.size,
      font: ctx.fonts[segment.font],
      color: colorOf(ctx, segment.tone === 'ink' ? palette.ink : palette.muted),
    });
    cursor += ctx.fonts[segment.font].widthOfTextAtSize(text, segment.size);
  }
}

/** Círculo numerado (o pin da página ou o selo do cartão). */
function drawBadge(ctx: Context, page: PDFPage, thread: AnnotatedPdfThread, x: number, y: number, radius: number, opacity: number) {
  const { fonts, input } = ctx;
  const resolved = thread.state === 'resolved';
  page.drawCircle({
    x,
    y,
    size: radius,
    color: colorOf(ctx, resolved ? input.palette.panel : threadColor(ctx, thread)),
    opacity,
    borderColor: resolved ? colorOf(ctx, input.palette.muted) : undefined,
    borderWidth: resolved ? 0.6 : 0,
    borderOpacity: opacity,
  });
  const label = String(thread.number);
  const size = radius * (label.length > 2 ? 0.85 : 1.05);
  page.drawText(label, {
    x: x - fonts.bold.widthOfTextAtSize(label, size) / 2,
    y: y - size * 0.35,
    size,
    font: fonts.bold,
    color: colorOf(ctx, resolved ? input.palette.ink : input.palette.pinText),
    opacity: Math.min(1, opacity + 0.35),
  });
}

/** Ponto do pin na página mostrada (topo para baixo, de 0 a 1), como na tela: o pin ou o canto do trecho. */
function pinPoint(anchor: ThreadAnchor): { x: number; y: number } {
  if (anchor.type === 'pin') return anchor.point;
  const first: NormalizedRect | undefined = anchor.rects[0];
  return { x: first?.x ?? 0, y: first?.y ?? 0 };
}

/** Destaques, desenhos e pins de uma página (sistema da página mostrada, y para cima). */
function drawMarks(ctx: Context, page: PDFPage, threads: readonly AnnotatedPdfThread[], width: number, height: number) {
  const { lib, input } = ctx;
  page.pushOperators(lib.setLineJoin(lib.LineJoinStyle.Round));
  for (const thread of threads) {
    if (thread.state === 'outdated') continue;
    const resolved = thread.state === 'resolved';
    const { anchor } = thread;
    if (anchor.type === 'text') {
      for (const rect of anchor.rects) {
        page.drawRectangle({
          x: rect.x * width,
          y: height - (rect.y + rect.height) * height,
          width: rect.width * width,
          height: rect.height * height,
          color: colorOf(ctx, resolved ? input.palette.rule : input.palette.annotation['annotation-1']),
          opacity: resolved ? 0.6 : HIGHLIGHT_OPACITY,
          blendMode: lib.BlendMode.Multiply,
        });
      }
    } else if (anchor.drawing) {
      for (const stroke of anchor.drawing.strokes) {
        const points: string[] = [];
        for (let i = 0; i + 1 < stroke.points.length; i += 2) points.push(`${(stroke.points[i]! * width).toFixed(2)} ${(stroke.points[i + 1]! * height).toFixed(2)}`);
        if (points.length < 2) continue;
        page.drawSvgPath(`M ${points.join(' L ')}`, {
          x: 0,
          y: height,
          borderColor: colorOf(ctx, input.palette.annotation[stroke.color]),
          borderWidth: 1.4,
          borderOpacity: resolved ? 0.5 : 0.85,
          borderLineCap: lib.LineCapStyle.Round,
        });
      }
    }
  }
  // Pins por último, por cima dos destaques e desenhos.
  for (const thread of threads) {
    if (thread.state === 'outdated' || thread.markOnly) continue;
    const point = pinPoint(thread.anchor);
    drawBadge(ctx, page, thread, point.x * width, height - point.y * height, PIN_RADIUS, PIN_OPACITY);
  }
}

/** Margem com os cartões. Devolve se algum cartão foi encurtado ou ficou de fora. */
function drawMargin(ctx: Context, page: PDFPage, onPage: readonly AnnotatedPdfThread[], width: number, height: number, margin: number): boolean {
  const { palette, text } = ctx.input;
  // Desenho sem comentário não tem cartão.
  const threads = onPage.filter((thread) => !thread.markOnly);
  page.drawRectangle({ x: width, y: 0, width: margin, height, color: colorOf(ctx, palette.panel) });
  page.drawLine({ start: { x: width, y: 0 }, end: { x: width, y: height }, thickness: 0.6, color: colorOf(ctx, palette.rule) });
  const panelWidth = margin - PANEL_PADDING * 2;
  page.drawText(ellipsize(ctx.encode(text.heading), panelWidth, measure(ctx, 'regular', SIZE.heading)), {
    x: width + PANEL_PADDING,
    y: height - 14,
    size: SIZE.heading,
    font: ctx.fonts.regular,
    color: colorOf(ctx, palette.muted),
  });
  if (threads.length === 0) return false;

  const boxX = width + PANEL_PADDING;
  const innerWidth = panelWidth - BOX_PADDING * 2 - ACCENT_WIDTH;
  const ordered = [...threads].sort((a, b) => pinPoint(a.anchor).y - pinPoint(b.anchor).y || a.number - b.number);
  const lines = ordered.map((thread) => buildLines(ctx, thread, innerWidth));
  const boxes = ordered.map((thread, index) => ({
    desiredTop: pinPoint(thread.anchor).y * height - LINE.header / 2 - BOX_PADDING,
    lineHeights: lines[index]!.map((line) => line.height),
    minLines: 1,
  }));
  const area = { top: 22, bottom: height - 10, gap: BOX_GAP, padding: BOX_PADDING, continuationHeight: LINE.continued };
  let placements = layoutMarginBoxes(boxes, area);
  const hiddenCount = () => placements.filter((placement) => placement.hidden).length;
  // Cartões de fora: a última linha da margem avisa onde eles estão.
  if (hiddenCount() > 0) placements = layoutMarginBoxes(boxes, { ...area, bottom: area.bottom - 12 });

  ordered.forEach((thread, index) => {
    const placement = placements[index]!;
    if (placement.hidden) return;
    const color = threadColor(ctx, thread);
    const top = placement.top;
    page.drawRectangle({
      x: boxX,
      y: height - top - placement.height,
      width: panelWidth,
      height: placement.height,
      color: colorOf(ctx, palette.paper),
      borderColor: colorOf(ctx, palette.rule),
      borderWidth: 0.6,
    });
    page.drawRectangle({ x: boxX, y: height - top - placement.height, width: ACCENT_WIDTH, height: placement.height, color: colorOf(ctx, color) });

    const textX = boxX + ACCENT_WIDTH + BOX_PADDING;
    let cursor = top + BOX_PADDING;
    for (const line of lines[index]!.slice(0, placement.shownLines)) {
      const baseline = height - (cursor + line.height / 2 + (line.segments[0]?.size ?? SIZE.body) * 0.35);
      if (line.header) {
        drawBadge(ctx, page, thread, textX + BADGE_RADIUS, height - (cursor + line.height / 2), BADGE_RADIUS, 1);
        const status = line.header.status;
        const statusWidth = status ? ctx.fonts.regular.widthOfTextAtSize(status, SIZE.header) : 0;
        if (status) {
          page.drawText(status, { x: textX + innerWidth - statusWidth, y: baseline, size: SIZE.header, font: ctx.fonts.regular, color: colorOf(ctx, palette.muted) });
        }
        drawSegments(ctx, page, line.segments, textX + line.indent, baseline, innerWidth - line.indent - statusWidth - 4);
      } else {
        if (line.isQuote) {
          page.drawLine({
            start: { x: textX + 1, y: height - cursor },
            end: { x: textX + 1, y: height - cursor - line.height },
            thickness: 1,
            color: colorOf(ctx, palette.annotation['annotation-1']),
          });
        }
        drawSegments(ctx, page, line.segments, textX + line.indent, baseline, innerWidth - line.indent);
      }
      cursor += line.height;
    }
    if (placement.shownLines < lines[index]!.length) {
      const continued = ellipsize(ctx.encode(text.continued), innerWidth, measure(ctx, 'italic', SIZE.continued));
      page.drawText(continued, {
        x: textX,
        y: height - (cursor + LINE.continued / 2 + SIZE.continued * 0.35),
        size: SIZE.continued,
        font: ctx.fonts.italic,
        color: colorOf(ctx, palette.muted),
      });
    }

    // Ligação tracejada, como no Word: do pin até a borda da página e dali ao cartão.
    if (thread.state !== 'outdated') {
      const point = pinPoint(thread.anchor);
      const anchorY = height - point.y * height;
      const boxY = height - (top + BOX_PADDING + LINE.header / 2);
      const line = { thickness: 0.5, color: colorOf(ctx, color), opacity: 0.45, dashArray: [2, 2] };
      const startX = Math.min(width, point.x * width + PIN_RADIUS);
      if (startX < width) page.drawLine({ start: { x: startX, y: anchorY }, end: { x: width, y: anchorY }, ...line });
      page.drawLine({ start: { x: width, y: anchorY }, end: { x: boxX, y: boxY }, ...line });
    }
  });

  if (hiddenCount() > 0) {
    page.drawText(ellipsize(ctx.encode(text.hiddenOnPage(hiddenCount())), panelWidth, measure(ctx, 'italic', SIZE.continued)), {
      x: boxX,
      y: 10,
      size: SIZE.continued,
      font: ctx.fonts.italic,
      color: colorOf(ctx, palette.muted),
    });
  }
  return placements.some((placement) => placement.truncated);
}

/** Acrescenta a margem e as marcações a uma página. Devolve o tamanho final e se algum cartão não coube inteiro. */
function annotatePage(ctx: Context, page: PDFPage, threads: readonly AnnotatedPdfThread[]): { truncated: boolean; width: number; height: number } {
  const { lib } = ctx;
  const view = intersect(page.getCropBox(), page.getMediaBox());
  const geometry = pageGeometry(view, page.getRotation().angle);
  const margin = marginWidthFor(geometry.width);
  const extended = extendedView(geometry, margin);
  const media = union(page.getMediaBox(), extended);
  page.setMediaBox(media.x, media.y, media.width, media.height);
  page.setCropBox(extended.x, extended.y, extended.width, extended.height);
  // O conteúdo original já fica entre q e Q (o pdf-lib isola ao desenhar); daqui em diante, o
  // sistema de coordenadas é o da página como aparece, em pontos, com a origem embaixo à esquerda.
  page.pushOperators(lib.pushGraphicsState(), lib.concatTransformationMatrix(...geometry.matrix));
  drawMarks(ctx, page, threads, geometry.width, geometry.height);
  const truncated = drawMargin(ctx, page, threads, geometry.width, geometry.height, margin);
  page.pushOperators(lib.popGraphicsState());
  return { truncated, width: geometry.width + margin, height: geometry.height };
}

/** Páginas "Comentários completos" no fim do PDF: todas as threads, sem cortes. */
function appendSummary(ctx: Context, pdf: PDFDocument, threads: readonly AnnotatedPdfThread[], size: { width: number; height: number }) {
  const { input, fonts } = ctx;
  const { palette, text } = input;
  const side = 48;
  const width = size.width - side * 2;
  let page = pdf.addPage([size.width, size.height]);
  let y = size.height - side;
  const ensure = (needed: number) => {
    if (y - needed >= side) return;
    page = pdf.addPage([size.width, size.height]);
    y = size.height - side;
  };
  const write = (value: string, font: FontKind, fontSize: number, tone: Tone, indent = 0, lineHeight = fontSize * 1.35) => {
    for (const line of wrapText(ctx.encode(value), width - indent, measure(ctx, font, fontSize))) {
      ensure(lineHeight);
      y -= lineHeight;
      page.drawText(line, { x: side + indent, y: y + lineHeight * 0.25, size: fontSize, font: fonts[font], color: colorOf(ctx, tone === 'ink' ? palette.ink : palette.muted) });
    }
  };

  write(text.summaryTitle, 'bold', 13, 'ink');
  write(text.heading, 'regular', 8.5, 'muted');
  y -= 8;
  const ordered = threads.filter((thread) => !thread.markOnly).sort((a, b) => a.anchor.page - b.anchor.page || a.number - b.number);
  for (const thread of ordered) {
    ensure(40);
    y -= 10;
    const header = [`${thread.number}`, text.page(thread.anchor.page), thread.kindLabel, thread.statusLabel].filter(Boolean).join('  ·  ');
    write(header, 'bold', 9, 'ink');
    if (thread.anchor.type === 'text') write(`"${thread.anchor.quote.exact.replace(/\s+/g, ' ').trim()}"`, 'italic', 8.5, 'muted', 8);
    const comments = (list: readonly AnnotatedPdfComment[], tone: Tone) => {
      for (const comment of list) {
        y -= 3;
        write([comment.author, comment.date].filter(Boolean).join('  ·  '), 'bold', 8, tone, 8);
        write(markdownToPlainText(comment.body), 'regular', 8.5, tone, 8);
      }
    };
    if (thread.previousRound.length > 0) {
      y -= 2;
      write(text.previousRound, 'bold', 7.5, 'muted', 8);
      comments(thread.previousRound, 'muted');
    }
    comments(thread.comments, 'ink');
    y -= 4;
    ensure(6);
    page.drawLine({ start: { x: side, y }, end: { x: side + width, y }, thickness: 0.5, color: colorOf(ctx, palette.rule) });
  }
}

/** Gera o PDF com as marcações e os comentários a partir do PDF original da versão. */
export async function buildAnnotatedPdf(original: Uint8Array, input: AnnotatedPdfInput): Promise<Uint8Array> {
  // Só aqui o pdf-lib é baixado: ele vira um pedaço próprio do build.
  const lib = await import('pdf-lib');
  const pdf = await lib.PDFDocument.load(original, { updateMetadata: false });
  const fonts: Fonts = {
    regular: await pdf.embedFont(lib.StandardFonts.Helvetica),
    bold: await pdf.embedFont(lib.StandardFonts.HelveticaBold),
    italic: await pdf.embedFont(lib.StandardFonts.HelveticaOblique),
  };
  const ctx: Context = { lib, fonts, encode: makeEncoder(new Set(fonts.regular.getCharacterSet())), input };

  const pages = pdf.getPages();
  let needsSummary = false;
  // As páginas extras seguem o tamanho da primeira, já com a margem.
  let summarySize = { width: 595 + marginWidthFor(595), height: 842 };
  pages.forEach((page, index) => {
    const onPage = input.threads.filter((thread) => thread.anchor.page === index + 1);
    const result = annotatePage(ctx, page, onPage);
    if (result.truncated) needsSummary = true;
    if (index === 0) summarySize = { width: result.width, height: result.height };
  });
  // Thread de página que não existe nesta versão: só aparece nos comentários completos.
  if (input.threads.some((thread) => thread.anchor.page < 1 || thread.anchor.page > pages.length)) needsSummary = true;

  if (needsSummary && input.threads.length > 0) appendSummary(ctx, pdf, input.threads, summarySize);
  return pdf.save();
}
