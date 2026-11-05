/**
 * Regras puras da margem de comentários do PDF anotado (sem pdf-lib): texto
 * simples a partir do Markdown dos comentários, quebra de linha por largura
 * medida e a posição de cada cartão na margem, sem sobrepor nem sair da página.
 */

/** Markdown do comentário como texto corrido para o PDF (sem marcação, links com o endereço). */
export function markdownToPlainText(markdown: string): string {
  return (
    markdown
      .replace(/\r\n?/g, '\n')
      // Blocos de código: fica o conteúdo.
      .replace(/```[^\n]*\n?([\s\S]*?)```/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      // Imagens e links: o texto e, se for diferente, o endereço.
      .replace(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, '$1')
      .replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g, (_match, label: string, url: string) => (label === url ? url : `${label} (${url})`))
      // Títulos, citações e listas: só o texto, com marcador simples nas listas.
      .replace(/^\s{0,3}#{1,6}\s+/gm, '')
      .replace(/^\s{0,3}>\s?/gm, '')
      .replace(/^(\s*)[-*+]\s+/gm, '$1• ')
      // Ênfase: os marcadores saem.
      .replace(/(\*\*|__)(.+?)\1/g, '$2')
      .replace(/(^|[^\w*])\*(?!\s)([^*\n]+?)\*(?!\w)/g, '$1$2')
      .replace(/(^|[^\w_])_(?!\s)([^_\n]+?)_(?!\w)/g, '$1$2')
      .replace(/~~(.+?)~~/g, '$1')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

/**
 * Quebra o texto em linhas que cabem em `maxWidth` (pela função de medida da
 * fonte). Mantém as quebras de parágrafo e corta palavras maiores que a linha.
 */
export function wrapText(text: string, maxWidth: number, measure: (text: string) => number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      // Palavra (ou endereço) maior que a linha inteira: corta por caractere.
      let rest = word;
      while (measure(rest) > maxWidth && rest.length > 1) {
        let cut = rest.length - 1;
        while (cut > 1 && measure(rest.slice(0, cut)) > maxWidth) cut--;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    lines.push(line);
  }
  // Linhas vazias no fim (parágrafo vazio final) não ocupam espaço.
  while (lines.length > 1 && lines.at(-1) === '') lines.pop();
  return lines;
}

/** Corta o texto numa linha só, com reticências, se passar da largura. */
export function ellipsize(text: string, maxWidth: number, measure: (text: string) => number): string {
  if (measure(text) <= maxWidth) return text;
  let end = text.length;
  while (end > 0 && measure(`${text.slice(0, end).trimEnd()}...`) > maxWidth) end--;
  return `${text.slice(0, end).trimEnd()}...`;
}

export interface MarginBoxInput {
  /** Onde o cartão quer começar (pontos a partir do topo da página): a altura da marcação. */
  desiredTop: number;
  /** Altura de cada linha do cartão, na ordem. */
  lineHeights: readonly number[];
  /** Linhas que nunca saem do cartão (o cabeçalho com o número). */
  minLines: number;
}

export interface MarginArea {
  /** Faixa vertical livre da margem (pontos a partir do topo). */
  top: number;
  bottom: number;
  /** Espaço entre cartões. */
  gap: number;
  /** Respiro interno do cartão, em cima e embaixo. */
  padding: number;
  /** Altura da linha "continua no fim do PDF" de um cartão encurtado. */
  continuationHeight: number;
}

export interface MarginBoxPlacement {
  top: number;
  height: number;
  /** Quantas linhas aparecem (as demais ficam para os comentários completos no fim do PDF). */
  shownLines: number;
  truncated: boolean;
  /** Não coube nem com o mínimo de linhas: o cartão fica só no fim do PDF. */
  hidden: boolean;
}

/**
 * Posição dos cartões na margem, como os balões de comentário do Word: cada
 * um tenta ficar na altura da sua marcação, empurra o seguinte para baixo
 * quando se encostam e, se a página acabar, os de baixo sobem. Quando nem
 * assim cabem, o cartão mais alto perde linhas (uma por vez), e o que não
 * couber nem com o cabeçalho sai da margem.
 */
export function layoutMarginBoxes(boxes: readonly MarginBoxInput[], area: MarginArea): MarginBoxPlacement[] {
  const shown = boxes.map((box) => box.lineHeights.length);
  const hidden = boxes.map(() => false);
  const available = area.bottom - area.top;

  const heightOf = (index: number) => {
    const box = boxes[index]!;
    const count = shown[index]!;
    const lines = box.lineHeights.slice(0, count).reduce((total, height) => total + height, 0);
    return area.padding * 2 + lines + (count < box.lineHeights.length ? area.continuationHeight : 0);
  };
  const visible = () => boxes.map((_box, index) => index).filter((index) => !hidden[index]);
  const total = () => {
    const indices = visible();
    return indices.reduce((sum, index) => sum + heightOf(index), 0) + Math.max(0, indices.length - 1) * area.gap;
  };

  while (total() > available) {
    let tallest = -1;
    for (const index of visible()) {
      if (shown[index]! <= Math.min(boxes[index]!.minLines, boxes[index]!.lineHeights.length)) continue;
      if (tallest < 0 || heightOf(index) > heightOf(tallest)) tallest = index;
    }
    if (tallest < 0) break;
    shown[tallest]!--;
  }
  // Nem com o mínimo: os últimos cartões (mais abaixo na página) saem da margem.
  const byPosition = boxes.map((_box, index) => index).sort((a, b) => boxes[a]!.desiredTop - boxes[b]!.desiredTop || a - b);
  for (let cursor = byPosition.length - 1; cursor >= 0 && total() > available; cursor--) hidden[byPosition[cursor]!] = true;

  const tops = new Map<number, number>();
  const order = byPosition.filter((index) => !hidden[index]);
  let next = area.top;
  for (const index of order) {
    const top = Math.max(next, Math.min(Math.max(area.top, boxes[index]!.desiredTop), area.bottom - heightOf(index)));
    tops.set(index, top);
    next = top + heightOf(index) + area.gap;
  }
  let limit = area.bottom;
  for (const index of [...order].reverse()) {
    const top = Math.min(tops.get(index)!, limit - heightOf(index));
    tops.set(index, top);
    limit = top - area.gap;
  }

  return boxes.map((box, index) => ({
    top: tops.get(index) ?? area.top,
    height: hidden[index] ? 0 : heightOf(index),
    shownLines: hidden[index] ? 0 : shown[index]!,
    truncated: hidden[index] || shown[index]! < box.lineHeights.length,
    hidden: hidden[index]!,
  }));
}
