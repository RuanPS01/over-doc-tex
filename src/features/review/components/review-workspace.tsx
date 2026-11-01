import { MapPin, MessageSquare, PenLine, TextSelect } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, useRef, type ReactNode } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { PdfDocumentView } from '@/features/pdf-viewer/components/pdf-document-view';
import { useLayoutMode } from '@/hooks/use-layout-mode';
import { useT } from '@/hooks/use-t';
import { slugify } from '@/lib/download';
import { msg } from '@/lib/i18n';
import { sourceAt } from '@/lib/latex/synctex';
import { buildDrawing, flattenStroke, pinPointFor } from '@/lib/pdf/drawing';
import { buildQuote, normalizeRects } from '@/lib/pdf/text-anchor';
import { cn } from '@/lib/utils';
import type { AnnotationColor, ParticipantRole, ReviewStatus, SourceLocation } from '@shared/firestore/types';
import { useReviewActions, type GuestIdentity, type NewAnnotation } from '../hooks/use-review-actions';
import { useReviewDocuments, useReviewPageTexts, useReviewPdf, useReviewSyncData } from '../hooks/use-review-files';
import { useTextSelection } from '../hooks/use-text-selection';
import { useThreads } from '../hooks/use-threads';
import { anchorPoint, type PendingAnnotation, type ReviewSummary, type ReviewTool, type ThreadSummary } from '../model/review';
import { AnnotationLayer } from './annotation-layer';
import { PendingAnnotationPanel } from './pending-annotation-panel';
import { ReviewChangesDialog } from './review-changes-dialog';
import { ReviewHeader } from './review-header';
import { ReviewSharingDialog } from './review-sharing-dialog';
import { SelectionPopover } from './selection-popover';
import { ThreadList } from './thread-list';

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
  const [, navigate] = useLocation();
  const documents = useReviewDocuments(review);
  const [documentId, setDocumentId] = useState(review.grantedDocumentIds[0]!);
  const currentDocument = documents.find((item) => item.id === documentId);
  const { data: allThreads = [] } = useThreads(review.projectId, review.id, true);
  const threads = useMemo(() => allThreads.filter((thread) => thread.documentId === documentId), [allThreads, documentId]);
  const actions = useReviewActions(review, role, guest);
  const [sharingOpen, setSharingOpen] = useState(false);
  const { pdf, error: pdfError } = useReviewPdf(review, documentId);
  const pageTexts = useReviewPageTexts(review, documentId);
  const syncData = useReviewSyncData(review, documentId, Boolean(currentDocument?.hasSynctex));
  const [pageSizes, setPageSizes] = useState<Array<{ width: number; height: number }>>([]);
  const [tool, setTool] = useState<ReviewTool>('select');
  const [drawColor, setDrawColor] = useState<AnnotationColor>('annotation-2');
  const [pending, setPending] = useState<PendingAnnotation | null>(null);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [changesOpen, setChangesOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const canWrite = review.status !== 'closed';
  const [selection, clearSelection] = useTextSelection(scrollRef, canWrite && tool === 'select');

  // Primeira abertura pelo revisor: registra quem é e muda para "Em revisão".
  const markOpened = actions.markOpened;
  const openedRef = useRef(false);
  useEffect(() => {
    if (role !== 'reviewer' || review.reviewerUid !== null || review.status !== 'invited' || openedRef.current) return;
    openedRef.current = true;
    void markOpened().catch(() => undefined);
  }, [role, review.reviewerUid, review.status, markOpened]);

  const numbered = useMemo(() => threads.map((thread, index) => ({ thread, number: index + 1 })), [threads]);

  const startPending = (next: PendingAnnotation) => {
    setPending(next);
    setSelectedThreadId(null);
    if (!isDesktop) setSheetOpen(true);
  };

  const selectThread = useCallback(
    (threadId: string) => {
      setSelectedThreadId(threadId);
      if (!isDesktop) setSheetOpen(true);
      const thread = threads.find((item) => item.id === threadId);
      if (thread) scrollRef.current?.querySelector(`[data-pdf-page="${thread.anchor.page}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    },
    [threads, isDesktop],
  );

  const commentSelection = () => {
    if (!selection) return;
    const quote = buildQuote(pageTexts?.[selection.page - 1] ?? '', selection.text);
    const rects = normalizeRects(selection.rects, selection.pageBox);
    if (!quote || rects.length === 0) return;
    startPending({ kind: 'text', anchor: { type: 'text', page: selection.page, rects, ...quote } });
    clearSelection();
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
  };

  /** Linha do código sob o ponto (SyncTeX da versão), guardada na thread para "Abrir no código". */
  const sourceHintAt = (page: number, x: number, y: number): SourceLocation | null => {
    const size = pageSizes[page - 1];
    if (!syncData || !size) return null;
    const found = sourceAt(syncData, page, x * size.width, y * size.height);
    return found ? { path: found.path, line: found.line, column: null } : null;
  };

  const submitPending = async (body: string) => {
    if (!pending) return;
    const submitted = pending;
    // A ferramenta volta na hora: esperar o servidor desfaria uma ferramenta escolhida nesse meio-tempo.
    if (submitted.kind !== 'text') setTool('select');
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
    const threadId = await actions.createThread(documentId, annotation, body, sourceHintAt(reference.page, reference.x, reference.y));
    // Só limpa se a pessoa não começou outra marcação enquanto gravava.
    setPending((current) => (current === submitted ? null : current));
    if (threadId) setSelectedThreadId((current) => current ?? threadId);
  };

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

  const pendingPanel = pending ? (
    <PendingAnnotationPanel
      pending={pending}
      onColor={(color) => {
        setDrawColor(color);
        setPending((current) => (current?.kind === 'draw' ? { ...current, color, strokes: current.strokes.map((stroke) => ({ ...stroke, color })) } : current));
      }}
      onUndoStroke={() => setPending((current) => (current?.kind === 'draw' ? { ...current, strokes: current.strokes.slice(0, -1) } : current))}
      onSubmit={submitPending}
      onCancel={() => setPending(null)}
    />
  ) : null;

  const threadList = (
    <ThreadList
      projectId={review.projectId}
      reviewId={review.id}
      previousReviewId={review.previousReviewId}
      threads={threads}
      pendingPanel={pendingPanel}
      selectedThreadId={selectedThreadId}
      canWrite={canWrite}
      canOpenSource={role === 'author'}
      onSelect={selectThread}
      onOpenSource={openSource}
      onReply={actions.reply}
      onStatusChange={actions.setThreadStatus}
    />
  );

  const title =
    documents.length > 1 ? (
      <Select
        value={documentId}
        onValueChange={(next) => {
          setDocumentId(next);
          setPending(null);
          setSelectedThreadId(null);
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

  const tools = canWrite ? (
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
      {(tool !== 'select' || review.description) && (
        <p className="shrink-0 truncate border-b px-3 py-1.5 text-xs text-muted-foreground" title={review.description ?? undefined}>
          {tool === 'pin'
            ? t('Clique no ponto do PDF que quer comentar.')
            : tool === 'draw'
              ? t('Desenhe sobre a página; depois escreva o comentário ao lado.')
              : review.description}
        </p>
      )}
      <main className="relative flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          <PdfDocumentView
            pdf={pdf}
            error={pdfError}
            scrollRef={scrollRef}
            title={title}
            actions={tools}
            textLayer
            onPageSizes={setPageSizes}
            outlineKey="review"
            outlineDefaultOpen
            fileName={`${slugify(review.projectName)}-v${review.snapshotLabel}${documentId === 'main' ? '' : `-${slugify(currentDocument?.title ?? documentId)}`}.pdf`}
            renderOverlay={(page) => (
              <AnnotationLayer
                page={page}
                threads={numbered.filter(({ thread }) => thread.anchor.page === page)}
                pending={pending}
                tool={canWrite ? tool : 'select'}
                selectedThreadId={selectedThreadId}
                onPlacePin={(pinPage, point) => {
                  startPending({ kind: 'pin', page: pinPage, point });
                  setTool('select');
                }}
                onStroke={handleStroke}
                onSelect={selectThread}
              />
            )}
          />
        </div>
        {isDesktop ? (
          <aside aria-label={t('Comentários')} className="flex w-96 shrink-0 flex-col border-l bg-panel">
            {threadList}
          </aside>
        ) : (
          <Button className="absolute bottom-4 right-4 z-20 shadow-lg" onClick={() => setSheetOpen(true)}>
            <MessageSquare />
            {pending ? t('Escrever comentário') : t('Comentários ({count})', { count: threads.length })}
          </Button>
        )}
      </main>
      {selection && <SelectionPopover selection={selection} onComment={commentSelection} />}
      {!isDesktop && (
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent side="bottom" className="h-[75dvh] gap-0 p-0">
            <SheetTitle className="px-4 pt-4">{t('Comentários')}</SheetTitle>
            <SheetDescription className="sr-only">{t('Comentários da revisão, por página.')}</SheetDescription>
            {threadList}
          </SheetContent>
        </Sheet>
      )}
      {review.baseSnapshotId && <ReviewChangesDialog review={review} documentId={documentId} role={role} open={changesOpen} onOpenChange={setChangesOpen} />}
    </div>
  );
}
