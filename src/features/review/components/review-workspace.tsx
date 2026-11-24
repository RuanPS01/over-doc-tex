import { FileCheck2, Highlighter, MapPin, MessageSquare, PanelRightClose, PenLine, TextSelect, Type, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, useRef, type MouseEvent, type ReactNode } from 'react';
import { useDefaultLayout } from 'react-resizable-panels';
import { useLocation } from 'wouter';
import { UndoRedoButtons } from '@/components/common/undo-redo-buttons';
import { Button } from '@/components/ui/button';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup, safeLayoutStorage } from '@/components/ui/resizable';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { PdfDocumentView } from '@/features/pdf-viewer/components/pdf-document-view';
import { useCollapsiblePanel } from '@/hooks/use-collapsible-panel';
import { useLayoutMode } from '@/hooks/use-layout-mode';
import { useT } from '@/hooks/use-t';
import { useUndoShortcuts } from '@/hooks/use-undo-shortcuts';
import { downloadBytes, slugify } from '@/lib/download';
import { msg } from '@/lib/i18n';
import { sourceAt } from '@/lib/latex/synctex';
import { A4_ASPECT, boundsOf, buildDrawing, movePin, pinPointFor } from '@/lib/pdf/drawing';
import { buildQuote, normalizeRects } from '@/lib/pdf/text-anchor';
import { cn } from '@/lib/utils';
import type { Drawing, NormalizedPoint, ParticipantRole, ReviewStatus, SourceLocation, Stroke, TextBox } from '@shared/firestore/types';
import { useAnnotatedPdf } from '../hooks/use-annotated-pdf';
import { markingFrom, useReviewActions, useReviewViewer, type GuestIdentity, type NewAnnotation } from '../hooks/use-review-actions';
import { useReviewDocuments, useReviewPageTexts, useReviewPdf, useReviewSyncData } from '../hooks/use-review-files';
import { useReviewHistory } from '../hooks/use-review-history';
import { useTextSelection } from '../hooks/use-text-selection';
import { useThreads } from '../hooks/use-threads';
import {
  DEFAULT_DRAW_STYLE,
  DEFAULT_TEXT_STYLE,
  applyDrawPatch,
  applyTextPatch,
  changedKeys,
  newTextBox,
  styleOfStroke,
  styleOfText,
  type DrawStyle,
  type TextStyle,
} from '../model/markup';
import { anchorPoint, canManageThread, type PendingAnnotation, type ReviewSummary, type ReviewTool, type ThreadSummary } from '../model/review';
import { AnnotationLayer } from './annotation-layer';
import { MarkupPanel } from './markup-panel';
import { PendingAnnotationPanel } from './pending-annotation-panel';
import { ReviewChangesDialog } from './review-changes-dialog';
import { ReviewHeader } from './review-header';
import { ReviewSharingDialog } from './review-sharing-dialog';
import { SelectionPopover } from './selection-popover';
import { ThreadList } from './thread-list';

/** Remarcação com desenho: o desenho vale quando a pessoa para de desenhar por este tempo (dá para fazer vários traços). */
const RELOCATE_DRAW_DELAY = 1200;
/** Traço livre: os traços feitos em sequência viram um desenho só, gravado quando a pessoa para por este tempo. */
const INK_GROUP_DELAY = 1200;
/** Estilo mudado no painel para o desenho selecionado: grava quando os ajustes param por este tempo. */
const STYLE_SAVE_DELAY = 600;

const TOOLS: Array<{ id: ReviewTool; label: string; icon: ReactNode }> = [
  { id: 'select', label: msg('Selecionar texto'), icon: <TextSelect /> },
  { id: 'pin', label: msg('Ponto'), icon: <MapPin /> },
  { id: 'draw', label: msg('Desenhar'), icon: <PenLine /> },
  { id: 'write', label: msg('Texto'), icon: <Type /> },
];

interface ReviewWorkspaceProps {
  review: ReviewSummary;
  role: ParticipantRole;
  /** Revisor pelo link, sem conta: comenta com este nome. */
  guest?: GuestIdentity | null;
  onChangeGuestName?: () => void;
  /** Dono e editores do projeto: mostram o "Envio da revisão" no cabeçalho. */
  canManage?: boolean;
}

/**
 * Tela da revisão: PDF da versão congelada com destaques, desenhos e pins
 * numerados e, ao lado (no celular, num Sheet), as threads. Mesma casca do
 * editor: altura da tela e só os painéis rolam.
 */
export function ReviewWorkspace({ review, role, guest = null, onChangeGuestName, canManage = false }: ReviewWorkspaceProps) {
  const { t } = useT();
  const layoutMode = useLayoutMode();
  const isDesktop = layoutMode === 'desktop';
  // Desktop: PDF | comentários num grupo redimensionável (como as colunas do editor), com o layout lembrado.
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({ id: 'review-desktop', storage: safeLayoutStorage });
  const comments = useCollapsiblePanel('overdoctex.review-comments-width', 384);
  const [, navigate] = useLocation();
  const documents = useReviewDocuments(review);
  const [documentId, setDocumentId] = useState(review.grantedDocumentIds[0]!);
  const currentDocument = documents.find((item) => item.id === documentId);
  const { data: allThreads = [] } = useThreads(review.projectId, review.id, true);
  // Cartões e números só para as threads com comentário; o desenho sem comentário fica só no PDF.
  const threads = useMemo(() => allThreads.filter((thread) => thread.documentId === documentId && !thread.drawingOnly), [allThreads, documentId]);
  const drawings = useMemo(() => allThreads.filter((thread) => thread.documentId === documentId && thread.drawingOnly), [allThreads, documentId]);
  const actions = useReviewActions(review, role, guest);
  const reviewHistory = useReviewHistory(actions);
  const { history } = reviewHistory;
  const viewer = useReviewViewer(guest, canManage);
  const [sharingOpen, setSharingOpen] = useState(false);
  const { pdf, error: pdfError } = useReviewPdf(review, documentId);
  const pageTexts = useReviewPageTexts(review, documentId);
  const syncData = useReviewSyncData(review, documentId, Boolean(currentDocument?.hasSynctex));
  const [pageSizes, setPageSizes] = useState<Array<{ width: number; height: number }>>([]);
  const [tool, setTool] = useState<ReviewTool>('select');
  const [drawStyle, setDrawStyle] = useState<DrawStyle>(DEFAULT_DRAW_STYLE);
  const [textStyle, setTextStyle] = useState<TextStyle>(DEFAULT_TEXT_STYLE);
  const [pending, setPending] = useState<PendingAnnotation | null>(null);
  // Caixa de texto do rascunho em edição (ferramenta "Texto").
  const [activeTextIndex, setActiveTextIndex] = useState<number | null>(null);
  // Desenho já gravado aberto para editar: o rascunho começa com ele, e "Salvar alterações" troca a marcação.
  const [editingThread, setEditingThread] = useState<ThreadSummary | null>(null);
  // Edição do texto ali mesmo (clique com "Texto" ou duplo clique): grava sozinha quando a caixa sai de edição.
  const [editAutoSave, setEditAutoSave] = useState(false);
  // Estilo do desenho selecionado mudado no painel, mostrado antes de gravar.
  const [drawingPreview, setDrawingPreview] = useState<{ threadId: string; drawing: Drawing } | null>(null);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const flushPreviewRef = useRef<() => void>(() => undefined);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  // "Refazer a marcação": a marcação antiga sai do PDF e a thread espera a nova, que vale assim que é feita.
  const [relocatingId, setRelocatingId] = useState<string | null>(null);
  // Traço em andamento (botão apertado): o salvamento automático do desenho espera ele terminar.
  const strokingRef = useRef(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [changesOpen, setChangesOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const annotatedPdf = useAnnotatedPdf(review);
  const [isExporting, setIsExporting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const canWrite = review.status !== 'closed';
  // Marcações desligadas: o PDF aparece como foi congelado, sem destaques, desenhos e pins, e sem as
  // ferramentas de marcar e comentar (a lista de comentários continua ao lado).
  const [showMarkings, setShowMarkings] = useState(true);
  const canAnnotate = canWrite && showMarkings;
  const [selection, clearSelection] = useTextSelection(scrollRef, canAnnotate && tool === 'select');

  // Primeira abertura pelo revisor: registra quem é e muda para "Em revisão".
  const markOpened = actions.markOpened;
  const openedRef = useRef(false);
  useEffect(() => {
    if (role !== 'reviewer' || review.reviewerUid !== null || review.status !== 'invited' || openedRef.current) return;
    openedRef.current = true;
    void markOpened().catch(() => undefined);
  }, [role, review.reviewerUid, review.status, markOpened]);

  const numbered = useMemo(() => threads.map((thread, index) => ({ thread, number: index + 1 })), [threads]);
  // Se a thread sumir (excluída por outra pessoa), o modo de refazer a marcação acaba sozinho.
  const relocating = numbered.find((item) => item.thread.id === relocatingId) ?? null;

  const startPending = (next: PendingAnnotation) => {
    setPending(next);
    setSelectedThreadId(null);
    // O comentário novo é escrito no painel de comentários: se estiver recolhido, ele abre.
    if (isDesktop) comments.expand();
    else setSheetOpen(true);
  };

  const selectThread = useCallback(
    (threadId: string) => {
      // Clicar de novo no número ou no cartão da thread escolhida tira a seleção.
      if (threadId === selectedThreadId) {
        setSelectedThreadId(null);
        return;
      }
      setSelectedThreadId(threadId);
      setSelectedDrawingId(null);
      if (isDesktop) comments.expand();
      else setSheetOpen(true);
      const thread = threads.find((item) => item.id === threadId);
      if (thread) scrollRef.current?.querySelector(`[data-pdf-page="${thread.anchor.page}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    },
    [threads, isDesktop, comments.expand, selectedThreadId],
  );

  /** Clique num lugar vazio do PDF: nenhum comentário fica destacado. */
  const handlePdfAreaClick = (event: MouseEvent<HTMLDivElement>) => {
    if ((event.target as Element).closest('button, a, input, textarea, select')) return;
    // Soltar uma seleção de texto também gera clique: a seleção do comentário continua.
    if (!(window.getSelection()?.isCollapsed ?? true)) return;
    setSelectedThreadId(null);
    setSelectedDrawingId(null);
  };

  /** Trecho selecionado no PDF como marcação (citação com contexto e retângulos de 0 a 1). */
  const textPendingOf = (current: NonNullable<typeof selection>): PendingAnnotation | null => {
    const quote = buildQuote(pageTexts?.[current.page - 1] ?? '', current.text);
    const rects = normalizeRects(current.rects, current.pageBox);
    if (!quote || rects.length === 0) return null;
    return { kind: 'text', anchor: { type: 'text', page: current.page, rects, ...quote } };
  };

  const commentSelection = () => {
    if (!selection) return;
    const next = textPendingOf(selection);
    clearSelection();
    if (next) startPending(next);
  };

  /** Tamanho da página em pontos do PDF (A4 enquanto não carregou). */
  const pageOf = (page: number) => pageSizes[page - 1] ?? { width: 595, height: 595 * A4_ASPECT };

  /** Começa ou continua o rascunho de desenho da página (traços, formas e textos juntos). */
  const updateDraft = (page: number, change: (draft: { strokes: Stroke[]; texts: TextBox[] }) => { strokes: Stroke[]; texts: TextBox[] }) => {
    setPending((current) => {
      const base = current?.kind === 'draw' && current.page === page ? current : { strokes: [], texts: [] };
      return { kind: 'draw', page, ...change({ strokes: base.strokes, texts: base.texts }) };
    });
    setSelectedThreadId(null);
    setSelectedDrawingId(null);
  };

  /**
   * Desenho e texto novos não pedem comentário (para comentar, marca-se um ponto sobre eles): o
   * rascunho vira um desenho sem comentário assim que fica parado. Sai da tela na hora; o Firestore
   * mostra o desenho gravado antes de o servidor confirmar.
   */
  const commitDraft = (submitted: Extract<PendingAnnotation, { kind: 'draw' }>) => {
    setPending((current) => (current === submitted ? null : current));
    setActiveTextIndex(null);
    void run(async () => {
      const { annotation, sourceHint } = annotationOf(submitted);
      if (annotation.kind === 'pin') await reviewHistory.createDrawing(documentId, annotation, sourceHint);
    });
  };

  /** Desenho em outra página ainda não gravado: grava antes de começar o desta. */
  const commitOtherPage = (page: number) => {
    if (pending?.kind === 'draw' && pending.page !== page && !editingThread && !relocating) commitDraft(pending);
  };

  const handleStroke = (page: number, stroke: Stroke) => {
    // Na edição de um desenho gravado, ele fica na página dele.
    if (editingThread && pending?.kind === 'draw' && pending.page !== page) return;
    commitOtherPage(page);
    updateDraft(page, (draft) => ({ ...draft, strokes: [...draft.strokes, stroke] }));
  };

  const createText = (page: number, point: NormalizedPoint) => {
    if (editingThread && pending?.kind === 'draw' && pending.page !== page) return;
    commitOtherPage(page);
    const box = newTextBox(point, textStyle, pageOf(page));
    const index = pending?.kind === 'draw' && pending.page === page ? pending.texts.length : 0;
    updateDraft(page, (draft) => ({ ...draft, texts: [...draft.texts, box] }));
    setActiveTextIndex(index);
  };

  const updateText = (index: number, box: TextBox) => {
    setPending((current) => (current?.kind === 'draw' ? { ...current, texts: current.texts.map((item, position) => (position === index ? box : item)) } : current));
  };

  const removeText = (index: number) => {
    setActiveTextIndex(null);
    setPending((current) => {
      if (current?.kind !== 'draw') return current;
      const texts = current.texts.filter((_, position) => position !== index);
      // Rascunho novo que ficou vazio some (o desenho em edição continua até salvar ou cancelar).
      return texts.length === 0 && current.strokes.length === 0 && !editingThread ? null : { ...current, texts };
    });
  };

  /** Escolhe outra caixa (ou nenhuma); a que estava em edição sai se ficou vazia. */
  const selectText = (index: number | null) => {
    const previous = activeTextIndex;
    const box = previous !== null && pending?.kind === 'draw' ? pending.texts[previous] : undefined;
    if (previous !== null && previous !== index && box && !box.text.trim()) {
      removeText(previous);
      // Os índices depois da caixa removida andam uma posição.
      setActiveTextIndex(index === null ? null : index > previous ? index - 1 : index);
      return;
    }
    setActiveTextIndex(index);
  };

  const activeText = tool === 'write' && activeTextIndex !== null && pending?.kind === 'draw' ? (pending.texts[activeTextIndex] ?? null) : null;
  const activePageWidth = pending?.kind === 'draw' ? pageOf(pending.page).width : 595;

  /** Painel "Texto": muda a caixa escolhida (só o que mudou) e vira o padrão das próximas. */
  const changeTextStyle = (style: TextStyle) => {
    const shown = activeText ? styleOfText(activeText, activePageWidth) : textStyle;
    const patch = changedKeys(shown, style);
    setTextStyle((current) => ({ ...current, ...patch }));
    if (activeText && activeTextIndex !== null) updateText(activeTextIndex, applyTextPatch(activeText, patch, activePageWidth));
  };

  /**
   * Painel "Desenho": vale para os próximos traços e, na edição de um desenho gravado, muda também
   * os traços dele (o painel começa a edição com o estilo e a ferramenta do primeiro traço).
   */
  const changeDrawStyle = (style: DrawStyle) => {
    const patch = changedKeys(drawStyle, style);
    setDrawStyle(style);
    const { tool: _tool, ...stylePatch } = patch;
    if (editingThread && Object.keys(stylePatch).length > 0) {
      setPending((current) => (current?.kind === 'draw' ? { ...current, strokes: current.strokes.map((stroke) => applyDrawPatch(stroke, stylePatch)) } : current));
    }
  };

  /** Linha do código sob o ponto (SyncTeX da versão), guardada na thread para "Abrir no código". */
  const sourceHintAt = (page: number, x: number, y: number): SourceLocation | null => {
    const size = pageSizes[page - 1];
    if (!syncData || !size) return null;
    const found = sourceAt(syncData, page, x * size.width, y * size.height);
    return found ? { path: found.path, line: found.line, column: null } : null;
  };

  /** Marcação pronta para gravar (o desenho simplificado com o pin no canto) e a linha do código sob ela. */
  const annotationOf = (submitted: PendingAnnotation): { annotation: NewAnnotation; sourceHint: SourceLocation | null } => {
    let annotation: NewAnnotation;
    if (submitted.kind === 'text') annotation = { kind: 'text', anchor: submitted.anchor };
    else if (submitted.kind === 'pin') annotation = { kind: 'pin', page: submitted.page, point: submitted.point, drawing: null };
    else {
      const size = pageOf(submitted.page);
      const drawing = buildDrawing(submitted.strokes, submitted.texts, size.height / size.width);
      if (!drawing) throw new Error(t('Desenho vazio ou grande demais.'));
      annotation = { kind: 'pin', page: submitted.page, point: pinPointFor(drawing.bounds), drawing };
    }
    // Trecho: o meio da primeira linha selecionada (o topo do retângulo cai na linha de cima).
    const firstRect = annotation.kind === 'text' ? annotation.anchor.rects[0] : undefined;
    const reference =
      annotation.kind === 'pin'
        ? { page: annotation.page, ...annotation.point }
        : firstRect
          ? { page: annotation.anchor.page, x: firstRect.x + Math.min(0.02, firstRect.width / 2), y: firstRect.y + firstRect.height / 2 }
          : anchorPoint({ anchor: annotation.anchor });
    return { annotation, sourceHint: sourceHintAt(reference.page, reference.x, reference.y) };
  };

  const submitPending = async (body: string) => {
    if (!pending) return;
    const submitted = pending;
    // A ferramenta volta na hora: esperar o servidor desfaria uma ferramenta escolhida nesse meio-tempo.
    if (submitted.kind !== 'text') setTool('select');
    const { annotation, sourceHint } = annotationOf(submitted);
    const created = await reviewHistory.createThread(documentId, annotation, body, sourceHint);
    // Só limpa se a pessoa não começou outra marcação enquanto gravava.
    setPending((current) => (current === submitted ? null : current));
    if (created) setSelectedThreadId((current) => current ?? created.threadId);
  };

  /**
   * "Refazer a marcação": a marcação antiga sai do PDF e a ferramenta segue o tipo dela (trecho
   * seleciona texto, ponto marca ponto, desenho desenha na mesma cor). A marcação nova vale assim
   * que é feita; "Cancelar remarcação", no cartão, traz a antiga de volta.
   */
  const startRelocate = (thread: ThreadSummary) => {
    setShowMarkings(true);
    setPending(null);
    clearSelection();
    setSelectedThreadId(null);
    setSelectedDrawingId(null);
    setRelocatingId(thread.id);
    if (thread.anchor.type === 'text') setTool('select');
    else if (thread.anchor.drawing) {
      setTool('draw');
      const color = thread.anchor.drawing.strokes[0]?.color;
      if (color) setDrawStyle((current) => ({ ...current, color }));
    } else setTool('pin');
    // No celular o Sheet fecha para liberar o PDF.
    if (isDesktop) comments.expand();
    else setSheetOpen(false);
  };

  /** "Editar": o desenho gravado vira o rascunho (formas e textos editáveis); a marcação antiga sai do PDF até salvar ou cancelar. */
  const startEdit = (thread: ThreadSummary, inline = false) => {
    if (thread.anchor.type !== 'pin' || !thread.anchor.drawing) return;
    const { strokes, texts = [] } = thread.anchor.drawing;
    // Um rascunho novo ainda não gravado vai antes (a edição usa o mesmo lugar do rascunho).
    if (pending?.kind === 'draw' && !editingThread && !relocating) commitDraft(pending);
    flushPreviewRef.current();
    setShowMarkings(true);
    clearSelection();
    setRelocatingId(null);
    setSelectedThreadId(null);
    setSelectedDrawingId(null);
    setEditingThread(thread);
    setEditAutoSave(inline);
    setPending({ kind: 'draw', page: thread.anchor.page, strokes, texts });
    const textOnly = texts.length > 0 && strokes.length === 0;
    setTool(inline || textOnly ? 'write' : 'draw');
    if (strokes[0]) setDrawStyle(styleOfStroke(strokes[0]));
    // Texto editado ali mesmo: a primeira caixa já abre para digitar.
    setActiveTextIndex(inline && texts.length > 0 ? 0 : null);
    if (!isDesktop) setSheetOpen(false);
  };

  const cancelEdit = () => {
    setEditingThread(null);
    setEditAutoSave(false);
    setActiveTextIndex(null);
    setPending(null);
    setTool('select');
  };

  /**
   * Grava o desenho editado no lugar do antigo (dá para desfazer); o número fica no canto dele,
   * como na criação. Sem mudança, nada é gravado. Desenho sem comentário que ficou vazio sai do PDF
   * (o desfazer traz de volta); o comentário com desenho vira um ponto.
   */
  const saveEdit = () => {
    const target = editingThread;
    if (!target || target.anchor.type !== 'pin' || pending?.kind !== 'draw') return;
    const size = pageOf(pending.page);
    const drawing = buildDrawing(pending.strokes, pending.texts, size.height / size.width);
    const original = target.anchor.drawing;
    // O rascunho sai na hora: um Ctrl+Z durante a gravação desfaz a edição, não um traço dele. O
    // Firestore aplica a mudança na tela antes de o servidor confirmar, então o desenho antigo não pisca.
    cancelEdit();
    if (!drawing && target.drawingOnly) {
      void run(() => deleteThread(target));
      return;
    }
    const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
    if (drawing && original && same(drawing.strokes, original.strokes) && same(drawing.texts ?? [], original.texts ?? [])) return;
    const point = drawing ? pinPointFor(drawing.bounds) : target.anchor.point;
    const annotation: NewAnnotation = { kind: 'pin', page: pending.page, point, drawing };
    void run(() => reviewHistory.setMarking(target, markingFrom(annotation, sourceHintAt(pending.page, point.x, point.y))));
  };

  /** Desenho selecionado movido, girado, redimensionado ou com o estilo mudado: grava no lugar (dá para desfazer). */
  const commitDrawing = (thread: ThreadSummary, drawing: Drawing) =>
    run(async () => {
      if (thread.anchor.type !== 'pin') return;
      const page = thread.anchor.page;
      const point = pinPointFor(drawing.bounds);
      await reviewHistory.setMarking(thread, markingFrom({ kind: 'pin', page, point, drawing }, sourceHintAt(page, point.x, point.y)));
      setDrawingPreview((current) => (current?.drawing === drawing ? null : current));
    });

  /** Estilo mudado no painel para o desenho selecionado: aparece na hora e grava quando os ajustes param. */
  const previewDrawing = (thread: ThreadSummary, drawing: Drawing) => {
    setDrawingPreview({ threadId: thread.id, drawing });
    clearTimeout(previewTimerRef.current);
    const commit = () => {
      flushPreviewRef.current = () => undefined;
      void commitDrawing(thread, drawing);
    };
    flushPreviewRef.current = () => {
      clearTimeout(previewTimerRef.current);
      commit();
    };
    previewTimerRef.current = setTimeout(commit, STYLE_SAVE_DELAY);
  };

  // Ao trocar ou tirar a seleção (ou sair da tela), o estilo ainda não gravado é gravado na hora.
  useEffect(() => () => flushPreviewRef.current(), [selectedDrawingId]);

  const cancelRelocate = () => {
    setRelocatingId(null);
    setPending(null);
    setTool('select');
  };

  /** A marcação nova vai para a thread que esperava por ela (dá para desfazer). */
  const assignRelocation = (submitted: PendingAnnotation) => {
    const target = relocating;
    if (!target) return;
    setPending(null);
    setRelocatingId(null);
    setTool('select');
    void run(async () => {
      const { annotation, sourceHint } = annotationOf(submitted);
      await reviewHistory.setMarking(target.thread, markingFrom(annotation, sourceHint));
      setSelectedThreadId(target.thread.id);
    });
  };

  // Remarcação por trecho: soltar a seleção já basta.
  useEffect(() => {
    if (!relocating || !selection) return;
    const next = textPendingOf(selection);
    clearSelection();
    if (next) assignRelocation(next);
  }, [selection, relocatingId]);

  // Remarcação por desenho: vale quando a pessoa para de desenhar (dá para fazer vários traços antes).
  // Com um traço em andamento, espera ele terminar; um traço novo recomeça a contagem.
  useEffect(() => {
    if (!relocating || pending?.kind !== 'draw' || pending.strokes.length === 0) return;
    const submitted = pending;
    let timer: ReturnType<typeof setTimeout>;
    const attempt = () => {
      if (strokingRef.current) timer = setTimeout(attempt, 300);
      else assignRelocation(submitted);
    };
    timer = setTimeout(attempt, RELOCATE_DRAW_DELAY);
    return () => clearTimeout(timer);
  }, [pending, relocatingId]);

  // Desenho e texto novos são gravados sozinhos quando o rascunho fica parado: na hora, para formas e
  // textos (o texto, quando sai de edição); depois de uma pausa, para o traço livre, que junta os traços
  // feitos em sequência num desenho só. Um traço em andamento adia a gravação.
  useEffect(() => {
    if (pending?.kind !== 'draw' || relocating || editingThread || activeTextIndex !== null) return;
    const submitted = pending;
    if (submitted.strokes.length === 0 && !submitted.texts.some((box) => box.text.trim())) {
      setPending(null);
      return;
    }
    const freehand = submitted.strokes.some((stroke) => stroke.tool === 'pen' || stroke.tool === 'highlighter');
    let timer: ReturnType<typeof setTimeout>;
    const attempt = () => {
      if (strokingRef.current) timer = setTimeout(attempt, 300);
      else commitDraft(submitted);
    };
    timer = setTimeout(attempt, freehand ? INK_GROUP_DELAY : 0);
    return () => clearTimeout(timer);
  }, [pending, relocatingId, editingThread, activeTextIndex]);

  // Texto editado ali mesmo: grava sozinho quando a caixa sai de edição (clique fora, Esc, outra ferramenta).
  useEffect(() => {
    if (editingThread && editAutoSave && activeTextIndex === null) saveEdit();
  }, [editingThread, editAutoSave, activeTextIndex]);

  // Esc cancela a remarcação (a marcação antiga volta).
  useEffect(() => {
    if (!relocatingId) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) cancelRelocate();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [relocatingId]);

  /** Pin arrastado: o ponto e o desenho vão para o lugar novo, com a linha do código de lá (dá para desfazer). */
  const movePinTo = (thread: ThreadSummary, target: { x: number; y: number }) =>
    run(async () => {
      if (thread.anchor.type !== 'pin') return;
      const moved = movePin(thread.anchor.point, thread.anchor.drawing, target);
      const page = thread.anchor.page;
      const annotation: NewAnnotation = { kind: 'pin', page, point: moved.point, drawing: moved.drawing };
      await reviewHistory.setMarking(thread, markingFrom(annotation, sourceHintAt(page, moved.point.x, moved.point.y)));
    });

  const deleteThread = async (thread: ThreadSummary) => {
    await reviewHistory.deleteThread(thread);
    setSelectedThreadId((current) => (current === thread.id ? null : current));
    setSelectedDrawingId((current) => (current === thread.id ? null : current));
    setRelocatingId((current) => (current === thread.id ? null : current));
  };

  /** Ctrl+Z: com traços de um desenho ainda sem comentário, sai o último traço; senão, a última ação gravada. */
  const handleUndo = () => {
    if (pending?.kind === 'draw' && pending.strokes.length > 0) {
      setPending((current) =>
        current?.kind === 'draw' ? (current.strokes.length > 1 ? { ...current, strokes: current.strokes.slice(0, -1) } : null) : current,
      );
      return;
    }
    setActionError(null);
    void history.undo().catch(() => setActionError(t('Não foi possível desfazer. Outra pessoa pode ter mudado o mesmo comentário.')));
  };

  const handleRedo = () => {
    setActionError(null);
    void history.redo().catch(() => setActionError(t('Não foi possível refazer. Outra pessoa pode ter mudado o mesmo comentário.')));
  };

  useUndoShortcuts({ enabled: canWrite, onUndo: handleUndo, onRedo: handleRedo });
  const hasStrokesToUndo = pending?.kind === 'draw' && pending.strokes.length > 0;

  const openSource = (thread: ThreadSummary) => {
    if (!thread.sourceHint) return;
    navigate(`/p/${review.projectId}?arquivo=${encodeURIComponent(thread.sourceHint.path)}&linha=${thread.sourceHint.line}`);
  };

  const run = async (action: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await action();
    } catch {
      setActionError(t('Não foi possível salvar. Confira a conexão e se a revisão continua aberta.'));
    }
  };

  // Na remarcação não há painel: a marcação vale sozinha e o cartão mostra o andamento e o cancelar.
  // Só ponto e trecho pedem comentário; o desenho e o texto flutuante são gravados sozinhos.
  const pendingPanel = pending && pending.kind !== 'draw' && !relocating ? (
    <PendingAnnotationPanel pending={pending} onSubmit={submitPending} onCancel={() => setPending(null)} />
  ) : null;
  const pendingKey = pendingPanel && pending ? (pending.kind === 'text' ? `text-${pending.anchor.page}` : `${pending.kind}-${pending.page}`) : null;

  const threadList = (
    <ThreadList
      projectId={review.projectId}
      reviewId={review.id}
      previousReviewId={review.previousReviewId}
      threads={threads}
      pendingPanel={pendingPanel}
      pendingKey={pendingKey}
      selectedThreadId={selectedThreadId}
      canWrite={canWrite}
      canOpenSource={role === 'author' && review.projectKind !== 'pdf'}
      viewer={viewer}
      relocation={relocating ? { threadId: relocating.thread.id, tool, isDrawing: pending?.kind === 'draw' } : null}
      onSelect={selectThread}
      onClearSelection={() => setSelectedThreadId(null)}
      onOpenSource={openSource}
      onReply={reviewHistory.reply}
      onStatusChange={reviewHistory.setThreadStatus}
      onEditComment={reviewHistory.editComment}
      onDeleteComment={reviewHistory.deleteComment}
      onRelocate={startRelocate}
      onCancelRelocate={cancelRelocate}
      onEditDrawing={startEdit}
      onDelete={deleteThread}
    />
  );

  const title =
    documents.length > 1 ? (
      <Select
        value={documentId}
        onValueChange={(next) => {
          // Desenho novo ainda não gravado vai para o documento em que foi feito.
          if (pending?.kind === 'draw' && !editingThread && !relocating) commitDraft(pending);
          setDocumentId(next);
          setPending(null);
          setRelocatingId(null);
          setEditingThread(null);
          setEditAutoSave(false);
          setActiveTextIndex(null);
          setSelectedThreadId(null);
          setSelectedDrawingId(null);
          setPageSizes([]);
        }}
      >
        <SelectTrigger className="h-8 w-auto max-w-[11rem] gap-1 border-0 bg-transparent px-1 text-xs font-medium" aria-label={t('Documento')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {documents.map((item) => (
            <SelectItem key={item.id} value={item.id}>
              {item.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    ) : (
      t('Versão {version}', { version: review.snapshotLabel })
    );

  const toggleMarkings = (visible: boolean) => {
    setShowMarkings(visible);
    if (visible) return;
    // Sem marcações não há onde marcar: a ferramenta volta a "Selecionar texto" e a marcação pendente sai
    // (o desenho novo ainda não gravado é gravado antes; a edição de um desenho é descartada).
    if (pending?.kind === 'draw' && !editingThread && !relocating) commitDraft(pending);
    setTool('select');
    setPending(null);
    setRelocatingId(null);
    setEditingThread(null);
    setEditAutoSave(false);
    setActiveTextIndex(null);
    clearSelection();
  };

  const markingsSwitch = (
    <label
      className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-1 text-xs text-muted-foreground hover:text-foreground"
      title={showMarkings ? t('Ver o PDF original, sem marcações') : t('Ver o PDF com as marcações')}
    >
      <Highlighter className="hidden size-4 sm:block" aria-hidden />
      <span className="hidden xl:inline">{t('Marcações')}</span>
      <Switch checked={showMarkings} onCheckedChange={toggleMarkings} aria-label={t('Mostrar as marcações e os comentários no PDF')} />
    </label>
  );

  const tools = canAnnotate ? (
    <div role="radiogroup" aria-label={t('Ferramenta')} className="flex shrink-0 items-center gap-0.5 rounded-md bg-muted p-0.5">
      {TOOLS.map((item) => (
        <button
          key={item.id}
          type="button"
          role="radio"
          aria-checked={tool === item.id}
          aria-label={t(item.label)}
          title={t(item.label)}
          onClick={() => {
            if (tool === 'write' && item.id !== 'write') selectText(null);
            setTool(item.id);
            if (item.id !== 'select') clearSelection();
          }}
          className={cn(
            'flex h-7 items-center gap-1 rounded px-1.5 text-xs [&_svg]:size-4',
            tool === item.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {item.icon}
          <span className="hidden xl:inline">{t(item.label)}</span>
        </button>
      ))}
    </div>
  ) : null;

  // Dica da ferramenta e mensagem de quem pediu a revisão: no espaço livre da barra do PDF, ao lado do
  // título (sem faixa nova acima do PDF). No celular a barra não tem espaço: a dica flutua sobre o PDF
  // e a mensagem vai para o topo do painel de comentários.
  const toolHint = relocating
    ? tool === 'pin'
      ? t('Clique no lugar novo do comentário {number}.', { number: relocating.number })
      : tool === 'draw'
        ? t('Desenhe a marcação nova do comentário {number}; ela vale quando você parar de desenhar.', { number: relocating.number })
        : t('Selecione o trecho novo do comentário {number}.', { number: relocating.number })
    : editingThread
      ? editAutoSave
        ? t('Editando o texto: clique fora da caixa para gravar.')
        : t('Editando o desenho: mude, mova ou apague o que quiser e use "Salvar alterações" no painel.')
      : tool === 'pin'
        ? t('Clique no ponto do PDF que quer comentar.')
        : tool === 'draw'
          ? t('Desenhe sobre a página: cada desenho é gravado ao terminar. Para comentar, use Ponto.')
          : tool === 'write'
            ? t('Clique na página para escrever; o texto é gravado ao clicar fora. Clique num texto para editá-lo.')
            : null;
  const authorMessage = review.description ? (
    <>
      <span className="font-medium text-foreground">{t('Mensagem:')}</span> {review.description}
    </>
  ) : null;
  // A mensagem fica à direita do espaço livre, encostada nas ferramentas a que ela se refere.
  const toolbarTitle = (
    <div className="flex w-full min-w-0 items-center gap-3">
      <div className="shrink-0">{title}</div>
      {(toolHint || authorMessage) && (
        <p
          role={toolHint ? 'status' : undefined}
          title={toolHint ?? review.description ?? undefined}
          className="ml-auto hidden min-w-0 truncate pr-1 text-right text-xs font-normal text-muted-foreground md:block"
        >
          {toolHint ?? authorMessage}
        </p>
      )}
    </div>
  );

  // Desktop: botão na barra do PDF que recolhe e reabre o painel de comentários.
  const commentsToggle = isDesktop ? (
    <Button
      variant={comments.collapsed ? 'ghost' : 'secondary'}
      size="sm"
      className="h-8 shrink-0 gap-1.5 px-2"
      aria-pressed={!comments.collapsed}
      aria-label={comments.collapsed ? t('Mostrar os comentários') : t('Recolher os comentários')}
      title={comments.collapsed ? t('Mostrar os comentários') : t('Recolher os comentários')}
      onClick={() => (comments.collapsed ? comments.expand() : comments.collapse())}
    >
      <MessageSquare />
      <span className="tabular-nums">{threads.length}</span>
    </Button>
  ) : null;

  // Painel flutuante de desenho e texto: aparece com essas ferramentas e na edição de um desenho gravado.
  // Desenho ou texto gravado selecionado (em "Selecionar texto"), por quem pode mexer nele: o painel
  // mostra o estilo dele e cada ajuste muda o selecionado.
  const selectedDrawing = tool === 'select' && canAnnotate && !editingThread ? (drawings.find((thread) => thread.id === selectedDrawingId) ?? null) : null;
  const selectedBase =
    selectedDrawing && selectedDrawing.anchor.type === 'pin' && canManageThread(selectedDrawing, viewer)
      ? drawingPreview?.threadId === selectedDrawing.id
        ? drawingPreview.drawing
        : selectedDrawing.anchor.drawing
      : null;
  const selectedPage = selectedDrawing ? pageOf(selectedDrawing.anchor.page) : pageOf(1);
  const selectedMode: 'draw' | 'write' = selectedBase && selectedBase.strokes.length === 0 ? 'write' : 'draw';
  const selectedDrawStyle = selectedBase?.strokes[0] ? styleOfStroke(selectedBase.strokes[0]) : drawStyle;
  const selectedTextStyle = selectedBase?.texts?.[0] ? styleOfText(selectedBase.texts[0], selectedPage.width) : textStyle;
  const restyleSelected = (change: (drawing: Drawing) => Drawing) => {
    if (selectedDrawing && selectedBase) previewDrawing(selectedDrawing, change(selectedBase));
  };

  // Painel flutuante de desenho e texto: com essas ferramentas, na edição de um desenho gravado e com um selecionado.
  const showMarkupPanel = canAnnotate && (tool === 'draw' || tool === 'write' || Boolean(editingThread) || Boolean(selectedBase));

  const pdfBaseName = `${slugify(review.projectName)}-v${review.snapshotLabel}${documentId === 'main' ? '' : `-${slugify(currentDocument?.title ?? documentId)}`}`;

  /** "PDF com anotações": marcações e comentários deste documento desenhados sobre o PDF da versão. */
  const downloadAnnotated = async () => {
    if (!pdf || isExporting) return;
    setIsExporting(true);
    setActionError(null);
    try {
      const bytes = await annotatedPdf(pdf, numbered, drawings);
      downloadBytes(bytes, `${pdfBaseName}-${t('anotado')}.pdf`, 'application/pdf');
    } catch {
      setActionError(t('Não foi possível gerar o PDF com anotações. Confira a conexão e tente de novo.'));
    } finally {
      setIsExporting(false);
    }
  };

  const pdfView = (
    <PdfDocumentView
      pdf={pdf}
      error={pdfError}
      scrollRef={scrollRef}
      title={toolbarTitle}
      actions={
        <>
          {/* As ferramentas vêm antes do interruptor: quando somem (marcações desligadas), ele não muda de lugar. */}
          {tools}
          {markingsSwitch}
          {canWrite && (
            <UndoRedoButtons
              className="hidden sm:flex"
              canUndo={history.canUndo || hasStrokesToUndo}
              canRedo={history.canRedo}
              onUndo={handleUndo}
              onRedo={handleRedo}
              undoLabel={hasStrokesToUndo ? t('último traço') : history.undoLabel}
              redoLabel={history.redoLabel}
              isBusy={history.isBusy}
            />
          )}
        </>
      }
      // O botão dos comentários fica no fim da barra, junto do painel que ele abre.
      trailingActions={commentsToggle}
      textLayer
      onPageSizes={setPageSizes}
      outlineKey="review"
      outlineDefaultOpen
      onAreaClick={handlePdfAreaClick}
      fileName={`${pdfBaseName}.pdf`}
      downloadOptions={[
        {
          id: 'annotated',
          label: t('PDF com anotações'),
          description: t('Destaques, desenhos e pins sobre o texto, com os comentários numa margem à direita de cada página.'),
          icon: <FileCheck2 />,
          onSelect: () => void downloadAnnotated(),
        },
      ]}
      isPreparingDownload={isExporting}
      floatingPanel={
        showMarkupPanel && selectedDrawing && selectedBase ? (
          <MarkupPanel
            selection
            defaultCollapsed={!isDesktop}
            mode={selectedMode}
            drawStyle={selectedDrawStyle}
            onDrawStyle={(style) => {
              const { tool: _tool, ...patch } = changedKeys(selectedDrawStyle, style);
              restyleSelected((drawing) => ({ ...drawing, strokes: drawing.strokes.map((stroke) => applyDrawPatch(stroke, patch)) }));
            }}
            textStyle={selectedTextStyle}
            onTextStyle={(style) => {
              const patch = changedKeys(selectedTextStyle, style);
              restyleSelected((drawing) => ({ ...drawing, texts: drawing.texts?.map((box) => applyTextPatch(box, patch, selectedPage.width)) }));
            }}
            activeText={
              selectedMode === 'write' && selectedBase.texts?.length === 1
                ? {
                    rotation: selectedBase.texts[0]!.rotation,
                    onRotation: (rotation) =>
                      restyleSelected((drawing) => {
                        const texts = (drawing.texts ?? []).map((box) => ({ ...box, rotation }));
                        return { ...drawing, texts, bounds: boundsOf(drawing.strokes, texts, selectedPage.height / selectedPage.width) };
                      }),
                    onDelete: () => void run(() => deleteThread(selectedDrawing)),
                  }
                : null
            }
            editing={null}
          />
        ) : showMarkupPanel ? (
          <MarkupPanel
            defaultCollapsed={!isDesktop}
            mode={tool === 'write' ? 'write' : 'draw'}
            drawStyle={drawStyle}
            onDrawStyle={changeDrawStyle}
            textStyle={activeText ? styleOfText(activeText, activePageWidth) : textStyle}
            onTextStyle={changeTextStyle}
            activeText={
              activeText && activeTextIndex !== null
                ? {
                    rotation: activeText.rotation,
                    onRotation: (rotation) => updateText(activeTextIndex, { ...activeText, rotation }),
                    onDelete: () => removeText(activeTextIndex),
                  }
                : null
            }
            editing={
              // O texto editado ali mesmo grava sozinho; salvar e cancelar são da edição pelo botão "Editar".
              editingThread && !editAutoSave
                ? {
                    onSave: saveEdit,
                    onCancel: cancelEdit,
                    canSave: pending?.kind === 'draw' && (pending.strokes.length > 0 || pending.texts.some((box) => box.text.trim().length > 0)),
                  }
                : null
            }
          />
        ) : undefined
      }
      renderOverlay={
        showMarkings
          ? (page) => (
              <AnnotationLayer
                page={page}
                threads={numbered.filter(({ thread }) => thread.anchor.page === page)}
                drawings={drawings.filter((thread) => thread.anchor.page === page)}
                pending={pending}
                tool={canAnnotate ? tool : 'select'}
                selectedThreadId={selectedThreadId}
                selectedDrawingId={selectedDrawingId}
                onPlacePin={(pinPage, point) => {
                  // Na remarcação, o ponto novo já vai para a thread que esperava.
                  if (relocating) assignRelocation({ kind: 'pin', page: pinPage, point });
                  else {
                    startPending({ kind: 'pin', page: pinPage, point });
                    setTool('select');
                  }
                }}
                onStrokingChange={(active) => {
                  strokingRef.current = active;
                }}
                drawStyle={drawStyle}
                onStroke={handleStroke}
                activeTextIndex={activeTextIndex}
                onTextCreate={createText}
                onTextSelect={selectText}
                onTextChange={updateText}
                onEditDrawing={(thread) => startEdit(thread)}
                onEditText={(thread) => startEdit(thread, true)}
                onTransformDrawing={(thread, drawing) => void commitDrawing(thread, drawing)}
                drawingPreview={drawingPreview}
                onSelect={selectThread}
                onSelectDrawing={(threadId) => {
                  setSelectedDrawingId((current) => (current === threadId ? null : threadId));
                  setSelectedThreadId(null);
                }}
                canMove={(thread) => canAnnotate && thread.anchor.type === 'pin' && thread.id !== relocatingId && canManageThread(thread, viewer)}
                onMovePin={movePinTo}
                onDeleteDrawing={(thread) => run(() => deleteThread(thread))}
                relocatingThreadId={relocating?.thread.id ?? editingThread?.id ?? null}
              />
            )
          : undefined
      }
    />
  );

  return (
    <div className="flex h-viewport flex-col overflow-hidden bg-background">
      <ReviewHeader
        review={review}
        role={role}
        onShowChanges={() => setChangesOpen(true)}
        onStatusChange={(status: ReviewStatus) => void run(() => actions.setReviewStatus(status))}
        onOpenSharing={canManage ? () => setSharingOpen(true) : undefined}
        guestName={guest?.name ?? null}
        onChangeGuestName={onChangeGuestName}
      />
      {canManage && <ReviewSharingDialog open={sharingOpen} onOpenChange={setSharingOpen} review={review} />}
      {actionError && (
        <p role="alert" className="shrink-0 border-b bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
          {actionError}
        </p>
      )}
      <main className="relative flex min-h-0 flex-1">
        {toolHint && (
          <p
            role="status"
            className={cn(
              'pointer-events-none absolute top-12 z-10 truncate rounded-full border bg-background/95 px-3 py-1 text-xs text-muted-foreground shadow-sm md:hidden',
              // Com o painel no canto direito, a dica vai para a esquerda e deixa espaço para ele.
              showMarkupPanel ? 'left-4 max-w-[calc(100%-9rem)]' : 'left-1/2 max-w-[calc(100%-2rem)] -translate-x-1/2',
            )}
          >
            {toolHint}
          </p>
        )}
        {isDesktop ? (
          <ResizablePanelGroup orientation="horizontal" defaultLayout={defaultLayout} onLayoutChanged={onLayoutChanged}>
            <ResizablePanel id="document" minSize="35%">
              {pdfView}
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel
              id="comments"
              panelRef={comments.panelRef}
              defaultSize={384}
              minSize={260}
              maxSize="55%"
              collapsible
              collapsedSize={0}
              groupResizeBehavior="preserve-pixel-size"
              onResize={comments.onResize}
            >
              {!comments.collapsed && (
                <aside aria-label={t('Comentários')} className="flex h-full min-w-0 flex-col bg-panel">
                  <div className="flex h-10 shrink-0 items-center gap-2 border-b pl-3 pr-1 text-sm font-medium">
                    <MessageSquare className="size-4 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{t('Comentários')}</span>
                    <Button variant="ghost" size="icon" className="size-8" aria-label={t('Recolher os comentários')} title={t('Recolher os comentários')} onClick={comments.collapse}>
                      <PanelRightClose />
                    </Button>
                  </div>
                  {threadList}
                </aside>
              )}
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          <>
            <div className="min-w-0 flex-1">{pdfView}</div>
            {canWrite && (history.canUndo || history.canRedo || hasStrokesToUndo) && (
              // No celular a barra do PDF não tem espaço: desfazer e refazer flutuam no canto oposto ao dos comentários.
              <UndoRedoButtons
                className="absolute bottom-4 left-4 z-20 rounded-full border bg-background/95 p-0.5 shadow-lg sm:hidden"
                buttonClassName="size-9 rounded-full"
                canUndo={history.canUndo || hasStrokesToUndo}
                canRedo={history.canRedo}
                onUndo={handleUndo}
                onRedo={handleRedo}
                undoLabel={hasStrokesToUndo ? t('último traço') : history.undoLabel}
                redoLabel={history.redoLabel}
                isBusy={history.isBusy}
              />
            )}
            {relocating ? (
              <Button variant="outline" className="absolute bottom-4 right-4 z-20 bg-background shadow-lg" onClick={cancelRelocate}>
                <X />
                {t('Cancelar remarcação')}
              </Button>
            ) : (
              <Button className="absolute bottom-4 right-4 z-20 shadow-lg" onClick={() => setSheetOpen(true)}>
                <MessageSquare />
                {pending && pending.kind !== 'draw' ? t('Escrever comentário') : t('Comentários ({count})', { count: threads.length })}
              </Button>
            )}
          </>
        )}
      </main>
      {selection && !relocating && <SelectionPopover selection={selection} onComment={commentSelection} />}
      {!isDesktop && (
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent side="bottom" className="h-[75dvh] gap-0 p-0">
            <SheetTitle className="px-4 pt-4">{t('Comentários')}</SheetTitle>
            <SheetDescription className="sr-only">{t('Comentários da revisão, por página.')}</SheetDescription>
            {authorMessage && <p className="px-4 pt-1 text-xs text-muted-foreground md:hidden">{authorMessage}</p>}
            {threadList}
          </SheetContent>
        </Sheet>
      )}
      {review.baseSnapshotId && <ReviewChangesDialog review={review} documentId={documentId} role={role} open={changesOpen} onOpenChange={setChangesOpen} />}
    </div>
  );
}
