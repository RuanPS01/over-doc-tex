import { MessageSquare } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { PdfDocumentView } from '@/features/pdf-viewer/components/pdf-document-view';
import { useLayoutMode } from '@/hooks/use-layout-mode';
import { slugify } from '@/lib/download';
import type { ParticipantRole, ReviewStatus } from '@shared/firestore/types';
import { useReviewActions } from '../hooks/use-review-actions';
import { useReviewPdf } from '../hooks/use-review-files';
import { useThreads } from '../hooks/use-threads';
import type { ReviewSummary } from '../model/review';
import { PinLayer, type PendingPin } from './pin-layer';
import { ReviewChangesDialog } from './review-changes-dialog';
import { ReviewHeader } from './review-header';
import { ThreadList } from './thread-list';

interface ReviewWorkspaceProps {
  review: ReviewSummary;
  role: ParticipantRole;
}

/**
 * Tela da revisão: PDF da versão congelada com pins numerados e, ao lado
 * (no celular, num Sheet), as threads. Mesma casca do editor: altura da tela
 * e só os painéis rolam.
 */
export function ReviewWorkspace({ review, role }: ReviewWorkspaceProps) {
  const layoutMode = useLayoutMode();
  const isDesktop = layoutMode === 'desktop';
  const { data: threads = [] } = useThreads(review.projectId, review.id, true);
  const actions = useReviewActions(review, role);
  const { pdf, error: pdfError } = useReviewPdf(review);
  const [isPlacing, setIsPlacing] = useState(false);
  const [pending, setPending] = useState<PendingPin | null>(null);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [changesOpen, setChangesOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const canWrite = review.status !== 'closed';

  // Primeira abertura pelo revisor: registra quem é e muda para "Em revisão".
  const markOpened = actions.markOpened;
  useEffect(() => {
    if (role === 'reviewer' && review.reviewerUid === null && review.status === 'invited') void markOpened().catch(() => undefined);
  }, [role, review.reviewerUid, review.status, markOpened]);

  const numbered = useMemo(() => threads.map((thread, index) => ({ thread, number: index + 1 })), [threads]);

  const selectThread = useCallback(
    (threadId: string) => {
      setSelectedThreadId(threadId);
      if (!isDesktop) setSheetOpen(true);
      const thread = threads.find((item) => item.id === threadId);
      if (thread) scrollRef.current?.querySelector(`[data-pdf-page="${thread.anchor.page}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    },
    [threads, isDesktop],
  );

  const handlePlace = (pin: PendingPin) => {
    setPending(pin);
    setIsPlacing(false);
    setSelectedThreadId(null);
    if (!isDesktop) setSheetOpen(true);
  };

  const run = async (action: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await action();
    } catch {
      setActionError('Não foi possível salvar. Confira a conexão e se a revisão continua aberta.');
    }
  };

  const threadList = (
    <ThreadList
      projectId={review.projectId}
      reviewId={review.id}
      threads={threads}
      pending={pending}
      selectedThreadId={selectedThreadId}
      canWrite={canWrite}
      onSelect={selectThread}
      onCreate={async (body) => {
        if (!pending) return;
        const threadId = await actions.createPin(pending.page, pending.point, body);
        setPending(null);
        if (threadId) setSelectedThreadId(threadId);
      }}
      onCancelPending={() => setPending(null)}
      onReply={actions.reply}
      onStatusChange={actions.setThreadStatus}
    />
  );

  return (
    <div className="flex h-viewport flex-col overflow-hidden bg-background">
      <ReviewHeader
        review={review}
        role={role}
        isPlacing={isPlacing}
        canWrite={canWrite}
        onTogglePlacing={() => setIsPlacing((placing) => !placing)}
        onShowChanges={() => setChangesOpen(true)}
        onStatusChange={(status: ReviewStatus) => void run(() => actions.setReviewStatus(status))}
      />
      {actionError && (
        <p role="alert" className="shrink-0 border-b bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
          {actionError}
        </p>
      )}
      {review.description && (
        <p className="shrink-0 truncate border-b px-3 py-1.5 text-xs text-muted-foreground" title={review.description}>
          {review.description}
        </p>
      )}
      <main className="relative flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          <PdfDocumentView
            pdf={pdf}
            error={pdfError}
            scrollRef={scrollRef}
            title={isPlacing ? 'Clique no ponto do PDF que quer comentar' : `Versão ${review.snapshotLabel}`}
            fileName={`${slugify(review.projectName)}-v${review.snapshotLabel}.pdf`}
            renderOverlay={(page) => (
              <PinLayer
                page={page}
                pins={numbered.filter(({ thread }) => thread.anchor.page === page)}
                pending={pending}
                isPlacing={isPlacing}
                selectedThreadId={selectedThreadId}
                onPlace={handlePlace}
                onSelect={selectThread}
              />
            )}
          />
        </div>
        {isDesktop ? (
          <aside aria-label="Comentários" className="flex w-96 shrink-0 flex-col border-l bg-panel">
            {threadList}
          </aside>
        ) : (
          <Button className="absolute bottom-4 right-4 z-10 shadow-lg" onClick={() => setSheetOpen(true)}>
            <MessageSquare />
            Comentários ({threads.length})
          </Button>
        )}
      </main>
      {!isDesktop && (
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent side="bottom" className="h-[75dvh] gap-0 p-0">
            <SheetTitle className="px-4 pt-4">Comentários</SheetTitle>
            <SheetDescription className="sr-only">Comentários da revisão, por página.</SheetDescription>
            {threadList}
          </SheetContent>
        </Sheet>
      )}
      {review.baseSnapshotId && <ReviewChangesDialog review={review} open={changesOpen} onOpenChange={setChangesOpen} />}
    </div>
  );
}
