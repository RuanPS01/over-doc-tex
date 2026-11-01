import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DiffPdfViewer } from '@/features/diff/components/diff-pdf-viewer';
import { DiffView } from '@/features/diff/components/diff-view';
import { useT } from '@/hooks/use-t';
import { slugify } from '@/lib/download';
import { diffStats } from '@/lib/diff/word-diff';
import { usePageTextDiff, useReviewVisualDiff } from '../hooks/use-review-files';
import type { ParticipantRole } from '@shared/firestore/types';
import type { ReviewSummary } from '../model/review';

interface ReviewChangesDialogProps {
  review: ReviewSummary;
  documentId: string;
  role: ParticipantRole;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * "Ver alterações" da revisão: o PDF recompilado com as marcações (gerado
 * pelo autor e guardado em diffs/{diffKey}) e, como alternativa, o texto das
 * páginas da versão anterior comparado com o da atual (.pages).
 */
export function ReviewChangesDialog({ review, documentId, role, open, onOpenChange }: ReviewChangesDialogProps) {
  const { t } = useT();
  const [view, setView] = useState<'pdf' | 'text'>('pdf');
  const { segments, error } = usePageTextDiff(review, documentId, open && view === 'text');
  const visual = useReviewVisualDiff(review, documentId, open && view === 'pdf', role);
  const stats = segments ? diffStats(segments) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[calc(100dvh-1rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-4 py-3 sm:px-5">
          <DialogTitle>{t('Alterações desde a rodada anterior')}</DialogTitle>
          <DialogDescription>
            {t('Versão anterior comparada com a {version}: inserido em verde, removido riscado em vermelho.', { version: review.snapshotLabel })}
          </DialogDescription>
        </DialogHeader>
        <div className="shrink-0 border-b px-4 py-2 sm:px-5">
          <Tabs value={view} onValueChange={(next) => setView(next as 'pdf' | 'text')}>
            <TabsList>
              <TabsTrigger value="pdf">{t('PDF marcado')}</TabsTrigger>
              <TabsTrigger value="text">{t('Texto')}</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        {view === 'pdf' ? (
          <div className="min-h-0 flex-1">
            <DiffPdfViewer
              diff={visual.diff}
              error={visual.error ?? (visual.missing ? t('O autor ainda não gerou a comparação em PDF desta rodada. Veja a aba Texto.') : null)}
              loadingLabel={visual.diff ? null : role === 'author' ? t('Gerando a comparação em PDF') : t('Carregando a comparação')}
              fileName={`${slugify(review.projectName)}-${t('alteracoes')}-v${review.snapshotLabel}.pdf`}
            />
          </div>
        ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3 sm:px-4">
          {error ? (
            <p className="px-2 text-sm text-destructive">{error}</p>
          ) : !segments ? (
            <p className="flex items-center gap-2 px-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t('Comparando')}
            </p>
          ) : stats && stats.insertedWords + stats.deletedWords === 0 ? (
            <p className="px-2 text-sm text-muted-foreground">{t('O texto do PDF não mudou.')}</p>
          ) : (
            <>
              <p role="status" className="mb-2 px-2 text-sm">
                <span className="text-diff-added">{t('{count} palavras inseridas', { count: stats!.insertedWords })}</span>,{' '}
                <span className="text-diff-removed">{t('{count} removidas', { count: stats!.deletedWords })}</span>.
              </p>
              <DiffView segments={segments} showLineNumbers={false} />
            </>
          )}
        </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
