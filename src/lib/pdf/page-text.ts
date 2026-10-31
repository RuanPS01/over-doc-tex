import { loadPdfjs } from './pdfjs';

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
