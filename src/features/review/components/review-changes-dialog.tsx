import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DiffView } from '@/features/diff/components/diff-view';
import { diffStats } from '@/lib/diff/word-diff';
import { usePageTextDiff } from '../hooks/use-review-files';
import type { ReviewSummary } from '../model/review';

interface ReviewChangesDialogProps {
  review: ReviewSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * "Ver alterações" do revisor: compara o texto das páginas do PDF da versão
 * anterior com o da versão em revisão. O revisor não lê o código-fonte,
 * só o texto guardado com cada versão (.pages).
 */
export function ReviewChangesDialog({ review, open, onOpenChange }: ReviewChangesDialogProps) {
  const { segments, error } = usePageTextDiff(review, open);
  const stats = segments ? diffStats(segments) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[calc(100dvh-1rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-4 py-3 sm:px-5">
          <DialogTitle>Alterações desde a rodada anterior</DialogTitle>
          <DialogDescription>
            Texto do PDF da versão anterior comparado com a versão {review.snapshotLabel}: inserido em verde, removido riscado em vermelho.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3 sm:px-4">
          {error ? (
            <p className="px-2 text-sm text-destructive">{error}</p>
          ) : !segments ? (
            <p className="flex items-center gap-2 px-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Comparando
            </p>
          ) : stats && stats.insertedWords + stats.deletedWords === 0 ? (
            <p className="px-2 text-sm text-muted-foreground">O texto do PDF não mudou.</p>
          ) : (
            <>
              <p role="status" className="mb-2 px-2 text-sm">
                <span className="text-diff-added">{stats!.insertedWords} palavras inseridas</span>,{' '}
                <span className="text-diff-removed">{stats!.deletedWords} removidas</span>.
              </p>
              <DiffView segments={segments} showLineNumbers={false} />
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
