import { FileCheck2, Highlighter, MapPin, MessageSquare, PanelRightClose, PenLine, TextSelect, X } from 'lucide-react';
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
import { buildDrawing, flattenStroke, movePin, pinPointFor } from '@/lib/pdf/drawing';
import { buildQuote, normalizeRects } from '@/lib/pdf/text-anchor';
import { cn } from '@/lib/utils';
import type { AnnotationColor, ParticipantRole, ReviewStatus, SourceLocation } from '@shared/firestore/types';
import { useAnnotatedPdf } from '../hooks/use-annotated-pdf';
import { markingFrom, useReviewActions, useReviewViewer, type GuestIdentity, type NewAnnotation } from '../hooks/use-review-actions';
import { useReviewDocuments, useReviewPageTexts, useReviewPdf, useReviewSyncData } from '../hooks/use-review-files';
import { useReviewHistory } from '../hooks/use-review-history';
import { useTextSelection } from '../hooks/use-text-selection';
import { useThreads } from '../hooks/use-threads';
import { anchorPoint, canManageThread, type PendingAnnotation, type ReviewSummary, type ReviewTool, type ThreadSummary } from '../model/review';
import { AnnotationLayer } from './annotation-layer';
import { PendingAnnotationPanel } from './pending-annotation-panel';
import { ReviewChangesDialog } from './review-changes-dialog';
import { ReviewHeader } from './review-header';
import { ReviewSharingDialog } from './review-sharing-dialog';
import { SelectionPopover } from './selection-popover';
import { ThreadList } from './thread-list';

/** Remarcação com desenho: o desenho vale quando a pessoa para de desenhar por este tempo (dá para fazer vários traços). */
const RELOCATE_DRAW_DELAY = 1200;

const TOOLS: Array<{ id: ReviewTool; label: string; icon: ReactNode }> = [
  { id: 'select', label: msg('Selecionar texto'), icon: <TextSelect /> },
  { id: 'pin', label: msg('Ponto'), icon: <MapPin /> },
  { id: 'draw', label: msg('Desenhar'), icon: <PenLine /> },
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
  const [drawColor, setDrawColor] = useState<AnnotationColor>('annotation-2');
  const [pending, setPending] = useState<PendingAnnotation | null>(null);
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

  const handleStroke = (page: number, points: Array<[number, number]>) => {
    const stroke = { tool: 'pen' as const, color: drawColor, width: 0.004, points: flattenStroke(points) };
    setPending((current) =>
      current?.kind === 'draw' && current.page === page
        ? { ...current, strokes: [...current.strokes, stroke] }
        : { kind: 'draw', page, strokes: [stroke], color: drawColor },
    );
    // No celular o Sheet só abre pelo botão: abrir a cada traço impediria desenhar o resto.
    setSelectedThreadId(null);
    setSelectedDrawingId(null);
    if (isDesktop && !relocatingId) comments.expand();
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
      const drawing = buildDrawing(submitted.strokes);
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

  /** "Manter só o desenho": o desenho fica no PDF sem comentário (sem cartão), e dá para apagá-lo depois. */
  const keepDrawing = async () => {
    if (pending?.kind !== 'draw') return;
    const submitted = pending;
    const { annotation, sourceHint } = annotationOf(submitted);
    if (annotation.kind !== 'pin') return;
    setTool('select');
    await reviewHistory.createDrawing(documentId, annotation, sourceHint);
    setPending((current) => (current === submitted ? null : current));
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
      setDrawColor(thread.anchor.drawing.strokes[0]?.color ?? drawColor);
    } else setTool('pin');
    // No celular o Sheet fecha para liberar o PDF.
    if (isDesktop) comments.expand();
    else setSheetOpen(false);
  };

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
  const pendingPanel = pending && !relocating ? (
    <PendingAnnotationPanel
      pending={pending}
      onColor={(color) => {
        setDrawColor(color);
        setPending((current) => (current?.kind === 'draw' ? { ...current, color, strokes: current.strokes.map((stroke) => ({ ...stroke, color })) } : current));
      }}
      onUndoStroke={() => setPending((current) => (current?.kind === 'draw' ? { ...current, strokes: current.strokes.slice(0, -1) } : current))}
      onSubmit={submitPending}
      onKeepDrawing={keepDrawing}
      onCancel={() => setPending(null)}
    />
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
      canOpenSource={role === 'author'}
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
      onDelete={deleteThread}
    />
  );

  const title =
    documents.length > 1 ? (
      <Select
        value={documentId}
        onValueChange={(next) => {
          setDocumentId(next);
          setPending(null);
          setRelocatingId(null);
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
    // Sem marcações não há onde marcar: a ferramenta volta a "Selecionar texto" e a marcação pendente sai.
    setTool('select');
    setPending(null);
    setRelocatingId(null);
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
    : tool === 'pin'
      ? t('Clique no ponto do PDF que quer comentar.')
      : tool === 'draw'
        ? t('Desenhe sobre a página; depois escreva o comentário ao lado.')
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
          {markingsSwitch}
          {tools}
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
          {commentsToggle}
        </>
      }
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
                onStroke={handleStroke}
                onSelect={selectThread}
                onSelectDrawing={(threadId) => {
                  setSelectedDrawingId((current) => (current === threadId ? null : threadId));
                  setSelectedThreadId(null);
                }}
                canMove={(thread) => canAnnotate && thread.anchor.type === 'pin' && thread.id !== relocatingId && canManageThread(thread, viewer)}
                onMovePin={movePinTo}
                onDeleteDrawing={(thread) => run(() => deleteThread(thread))}
                relocatingThreadId={relocating?.thread.id ?? null}
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
            className="pointer-events-none absolute left-1/2 top-12 z-10 max-w-[calc(100%-2rem)] -translate-x-1/2 truncate rounded-full border bg-background/95 px-3 py-1 text-xs text-muted-foreground shadow-sm md:hidden"
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
                {pending ? t('Escrever comentário') : t('Comentários ({count})', { count: threads.length })}
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
