import { describe, expect, it } from 'vitest';
import { decodeSyncData, encodeSyncData, parseSynctex, pdfAt, sourceAt } from '@/lib/latex/synctex';
import { projectPathFromTex } from '@/lib/latex/prepare';
import { canManageThread, isCommentAuthor, isThreadAuthor, toCommentSummary } from '@/features/review/model/review';
import type { CommentDoc } from '@shared/firestore/types';
import { boundsOf, buildDrawing, flattenStroke, MAX_DRAWING_POINTS, movePin, pinPointFor, simplify } from '@/lib/pdf/drawing';
import { reanchorQuote } from '@/lib/pdf/reanchor';
import { buildQuote, normalizeRects } from '@/lib/pdf/text-anchor';

// 1 bp = 65781.76 sp; a página começa a 1 pol. (4736286 sp) da borda.
const sp = (bp: number) => Math.round(bp * 65781.76);
const SYNCTEX = [
  'SyncTeX Version:1',
  'Input:1:/document.tex',
  'Input:2:/texlive/texmf-dist/tex/latex/base/article.cls',
  'Input:3://./cap/um.tex',
  'Output:pdf',
  'Magnification:1000',
  'Unit:1',
  'X Offset:0',
  'Y Offset:0',
  'Content:',
  '{1',
  `[1,3:${sp(72)},${sp(100)}:${sp(450)},${sp(700)},0`,
  `h1,4:${sp(72)},${sp(120)}:${sp(450)},${sp(10)},${sp(2)}`,
  `x1,4:${sp(80)},${sp(120)}`,
  `h3,7:${sp(72)},${sp(200)}:${sp(450)},${sp(10)},${sp(2)}`,
  `g2,99:${sp(300)},${sp(300)}`,
  ']',
  '}1',
  '{2',
  `h1,12:${sp(72)},${sp(90)}:${sp(450)},${sp(10)},${sp(2)}`,
  '}2',
  'Postamble:',
].join('\n');

describe('SyncTeX', () => {
  const data = parseSynctex(SYNCTEX, {
    toProjectPath: (raw) => projectPathFromTex(raw, 'tese/main.tex'),
    // O principal chegou ao TeX sem o preâmbulo (formato em cache): +10 linhas.
    lineOffset: (path) => (path === 'tese/main.tex' ? 10 : 0),
  });

  it('guarda só arquivos do projeto, com caminhos e linhas corrigidos', () => {
    expect(data.files).toEqual(['tese/main.tex', 'tese/cap/um.tex']);
    expect(data.pages).toHaveLength(2);
    expect(data.pages[0]!.every((record) => record.line !== 99)).toBe(true);
  });

  it('clique entre linhas usa a linha mais próxima, não uma caixa vertical grande', () => {
    expect(sourceAt(data, 1, 200, 124)).toEqual({ path: 'tese/main.tex', line: 14 });
    expect(data.pages[0]!.some((record) => record.height > 600)).toBe(false);
  });

  it('busca reversa: o ponto clicado vira arquivo e linha', () => {
    expect(sourceAt(data, 1, 200, 118)).toEqual({ path: 'tese/main.tex', line: 14 });
    expect(sourceAt(data, 1, 200, 199)).toEqual({ path: 'tese/cap/um.tex', line: 7 });
    expect(sourceAt(data, 2, 100, 89)).toEqual({ path: 'tese/main.tex', line: 22 });
  });

  it('busca direta: a linha vira página e altura no PDF', () => {
    expect(pdfAt(data, 'tese/cap/um.tex', 7)).toMatchObject({ page: 1 });
    expect(pdfAt(data, 'tese/main.tex', 22)?.page).toBe(2);
    expect(pdfAt(data, 'outro.tex', 1)).toBeNull();
  });

  it('o formato compacto da versão volta igual', () => {
    const decoded = decodeSyncData(encodeSyncData(data));
    expect(decoded.files).toEqual(data.files);
    expect(sourceAt(decoded, 1, 200, 199)).toEqual({ path: 'tese/cap/um.tex', line: 7 });
  });
});

describe('comentário em trecho', () => {
  it('acha a citação no texto da página, com contexto e posição, ignorando quebras de linha', () => {
    const page = 'Introdução\nA revisão de documentos científicos ainda depende\nde trocas de arquivos por e-mail.';
    const anchor = buildQuote(page, 'ainda depende de trocas')!;
    expect(anchor.quote.exact).toBe('ainda depende de trocas');
    expect(anchor.quote.prefix.endsWith('científicos')).toBe(true);
    expect(anchor.quote.suffix.startsWith('de arquivos')).toBe(true);
    expect(page.slice(anchor.position.start, anchor.position.end)).toBe('ainda depende\nde trocas');
  });

  it('junta os retângulos da mesma linha e normaliza pela página', () => {
    const page = { left: 100, top: 50, width: 600, height: 800 };
    const rects = normalizeRects(
      [
        { left: 160, top: 90, width: 100, height: 16 },
        { left: 262, top: 90, width: 120, height: 16 },
        { left: 100, top: 110, width: 200, height: 16 },
      ],
      page,
    );
    expect(rects).toHaveLength(2);
    expect(rects[0]).toEqual({ x: 0.1, y: 0.05, width: 0.37, height: 0.02 });
  });
});

describe('desenho livre', () => {
  it('simplifica pontos quase colineares e mantém as pontas', () => {
    const line: Array<[number, number]> = Array.from({ length: 50 }, (_, index) => [index / 100, index / 100 + (index % 2) * 0.0001]);
    expect(simplify(line)).toEqual([line[0], line[49]]);
    expect(flattenStroke(line)).toEqual([0, 0, 0.49, 0.4901]);
  });

  it('calcula a caixa, o ponto do pin e respeita o teto de pontos', () => {
    const stroke = { tool: 'pen' as const, color: 'annotation-2' as const, width: 0.004, points: [0.2, 0.3, 0.5, 0.25, 0.4, 0.6] };
    expect(boundsOf([stroke])).toEqual({ x: 0.2, y: 0.25, width: 0.3, height: 0.35 });
    expect(pinPointFor(boundsOf([stroke]))).toEqual({ x: 0.5, y: 0.25 });
    expect(buildDrawing([stroke])?.bounds.width).toBe(0.3);
    const huge = { ...stroke, points: Array.from({ length: (MAX_DRAWING_POINTS + 1) * 2 }, () => 0.5) };
    expect(buildDrawing([huge])).toBeNull();
    expect(buildDrawing([])).toBeNull();
  });
});

describe('reancoragem entre versões', () => {
  const anchorFor = (pages: string[], page: number, exact: string) => ({ page, ...buildQuote(pages[page - 1]!, exact)! });

  it('mantém a posição quando o texto ali não mudou', () => {
    const pages = ['Título\nA revisão de documentos ainda depende de e-mail.'];
    const anchor = anchorFor(pages, 1, 'depende de e-mail');
    expect(reanchorQuote(pages, anchor)).toEqual({ page: 1, start: anchor.position.start, end: anchor.position.end });
  });

  it('acha a citação deslocada, inclusive na página seguinte, pelo contexto', () => {
    const before = ['Intro. O termo chave aparece aqui. Outro termo chave depois.'];
    const anchor = anchorFor(before, 1, 'termo chave depois');
    const after = ['Parágrafo novo que empurrou tudo.', 'Intro. O termo chave aparece aqui. Outro termo chave depois.'];
    const match = reanchorQuote(after, anchor)!;
    expect(match.page).toBe(2);
    expect(after[1]!.slice(match.start, match.end)).toBe('termo chave depois');
  });

  it('tolera palavra trocada no meio e desiste quando o trecho sumiu', () => {
    const before = ['A revisão de documentos científicos ainda depende de trocas de arquivos.'];
    const anchor = anchorFor(before, 1, 'A revisão de documentos científicos ainda depende de trocas de arquivos');
    const after = ['A revisão de documentos acadêmicos ainda depende de trocas de arquivos.'];
    expect(after[0]!.slice(reanchorQuote(after, anchor)!.start, reanchorQuote(after, anchor)!.end)).toBe(
      'A revisão de documentos acadêmicos ainda depende de trocas de arquivos',
    );
    expect(reanchorQuote(['Texto completamente diferente.'], anchor)).toBeNull();
  });
});

describe('mexer em comentários da revisão', () => {
  const drawing = {
    bounds: { x: 0.1, y: 0.2, width: 0.2, height: 0.1 },
    strokes: [{ tool: 'pen' as const, color: 'annotation-2' as const, width: 0.004, points: [0.1, 0.2, 0.3, 0.3] }],
  };

  it('arrastar o pin leva o desenho junto, sem sair da página', () => {
    const moved = movePin({ x: 0.3, y: 0.2 }, drawing, { x: 0.5, y: 0.4 });
    expect(moved.point).toEqual({ x: 0.5, y: 0.4 });
    expect(moved.drawing?.bounds).toEqual({ x: 0.3, y: 0.4, width: 0.2, height: 0.1 });
    expect(moved.drawing?.strokes[0]?.points).toEqual([0.3, 0.4, 0.5, 0.5]);
    // Arrastado para fora: o desenho para na borda e o pin acompanha o mesmo deslocamento.
    const edge = movePin({ x: 0.3, y: 0.2 }, drawing, { x: 1.5, y: -1 });
    expect(edge.drawing?.bounds).toEqual({ x: 0.8, y: 0, width: 0.2, height: 0.1 });
    expect(edge.point).toEqual({ x: 1, y: 0 });
    expect(movePin({ x: 0.3, y: 0.2 }, null, { x: 0.9, y: 0.1 })).toEqual({ point: { x: 0.9, y: 0.1 }, drawing: null });
  });

  it('quem criou a thread ou edita o projeto a gerencia; o texto só quem escreveu edita', () => {
    const reviewer = { uid: 'rev', guestKey: null, canEditProject: false };
    const guest = { uid: 'g2', guestKey: 'maria souza', canEditProject: false };
    const editor = { uid: 'bia', guestKey: null, canEditProject: true };
    const byReviewer = { createdBy: 'rev', authorKey: null };
    const byGuest = { createdBy: 'g1', authorKey: 'maria souza' };
    expect(isThreadAuthor(byReviewer, reviewer)).toBe(true);
    expect(canManageThread(byReviewer, guest)).toBe(false);
    // O mesmo nome em outro aparelho (outra sessão anônima) é o mesmo revisor.
    expect(canManageThread(byGuest, guest)).toBe(true);
    expect(canManageThread(byGuest, editor)).toBe(true);
    expect(isThreadAuthor(byGuest, editor)).toBe(false);
    expect(isCommentAuthor({ authorId: 'rev', authorKey: null }, editor)).toBe(false);
    expect(isCommentAuthor({ authorId: 'g1', authorKey: 'maria souza' }, guest)).toBe(true);
    expect(isCommentAuthor({ authorId: 'x', authorKey: null }, { uid: null, guestKey: null, canEditProject: false })).toBe(false);
  });

  it('comentário editado e excluído aparecem no resumo', () => {
    const when = { toDate: () => new Date(0), toMillis: () => 0 };
    const base = { authorId: 'rev', authorName: 'Rev', authorPhotoURL: null, authorRole: 'reviewer', kind: 'comment', statusChange: null, createdAt: when } as const;
    const edited = toCommentSummary('c1', { ...base, body: 'novo', editedAt: when, deletedAt: null } as unknown as CommentDoc);
    expect(edited).toMatchObject({ editedAt: new Date(0), isDeleted: false });
    expect(toCommentSummary('c2', { ...base, body: '', editedAt: null, deletedAt: when } as unknown as CommentDoc).isDeleted).toBe(true);
  });
});
