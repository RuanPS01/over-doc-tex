import type { NormalizedRect } from '@shared/firestore/types';
import { loadPdfjs } from './pdfjs';
import { normalizeRects } from './text-anchor';

/**
 * Texto de cada página do PDF, na ordem do pdf.js (a mesma da camada de
 * texto). Guardado com a versão: ancora comentários e alimenta o diff que o
 * revisor vê, sem acesso ao código-fonte.
 */
export async function extractPageTexts(pdf: Uint8Array): Promise<string[]> {
  const pdfjs = await loadPdfjs();
  // O pdf.js transfere o buffer para o worker: a cópia preserva o original.
  const task = pdfjs.getDocument({ data: pdf.slice() });
  try {
    const doc = await task.promise;
    const pages: string[] = [];
    for (let number = 1; number <= doc.numPages; number++) {
      const content = await (await doc.getPage(number)).getTextContent();
      let text = '';
      for (const item of content.items) {
        if (!('str' in item)) continue;
        text += item.str + (item.hasEOL ? '\n' : '');
      }
      pages.push(text);
    }
    return pages;
  } finally {
    void task.destroy();
  }
}

export interface TextLocator {
  /** Tamanho de cada página em pontos do PDF. */
  pageSizes: Array<{ width: number; height: number }>;
  /** Retângulos normalizados (por linha) do trecho [start, end) do texto da página. */
  rectsFor: (page: number, start: number, end: number) => Promise<NormalizedRect[]>;
  close: () => void;
}

/**
 * Geometria do texto de um PDF, na mesma contagem de caracteres do `.pages`
 * (texto de cada item mais quebra de linha onde o pdf.js marca fim de linha).
 * Usado para redesenhar o destaque de um trecho reancorado na versão nova.
 */
export async function createTextLocator(pdf: Uint8Array): Promise<TextLocator> {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({ data: pdf.slice() });
  const doc = await task.promise;
  const pageSizes: TextLocator['pageSizes'] = [];
  for (let number = 1; number <= doc.numPages; number++) {
    const viewport = (await doc.getPage(number)).getViewport({ scale: 1 });
    pageSizes.push({ width: viewport.width, height: viewport.height });
  }
  return {
    pageSizes,
    rectsFor: async (page, start, end) => {
      const size = pageSizes[page - 1];
      if (!size) return [];
      const content = await (await doc.getPage(page)).getTextContent();
      const rects: Array<{ left: number; top: number; width: number; height: number }> = [];
      let offset = 0;
      for (const item of content.items) {
        if (!('str' in item)) continue;
        const length = item.str.length;
        const from = Math.max(start, offset);
        const to = Math.min(end, offset + length);
        if (to > from && length > 0) {
          const [, , c = 0, d = 0, x = 0, y = 0] = item.transform as number[];
          const fontHeight = item.height || Math.hypot(c, d);
          rects.push({
            left: x + (item.width * (from - offset)) / length,
            // Do topo das letras (cerca de 0,85 da altura acima da linha de base) até um pouco abaixo dela.
            top: size.height - (y + fontHeight * 0.85),
            width: (item.width * (to - from)) / length,
            height: fontHeight * 1.05,
          });
        }
        offset += length + (item.hasEOL ? 1 : 0);
        if (offset >= end) break;
      }
      return normalizeRects(rects, { left: 0, top: 0, width: size.width, height: size.height });
    },
    close: () => void task.destroy(),
  };
}
