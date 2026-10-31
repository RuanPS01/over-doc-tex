import { Loader2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { MemberProfile } from '@shared/firestore/types';
import { buildZip } from '@/lib/project-archive/zip';
import { downloadBytes, slugify } from '@/lib/download';
import type { TexIssue } from '@/lib/latex/prepare';
import { useSnapshotFiles } from '../hooks/use-snapshot-files';
import { useSnapshots, type SnapshotSummary } from '../hooks/use-snapshots';
import { FreezeVersionForm } from './freeze-version-form';
import { VersionCard } from './version-card';
import { VersionPdfDialog } from './version-pdf-dialog';

interface VersionHistorySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
  canEdit: boolean;
  currentUid: string | null;
  memberProfiles: Record<string, MemberProfile>;
  onCompare: (snapshotId: string) => void;
  onIssueSelect: (issue: TexIssue) => void;
  /** Conteúdo da aba "Revisões" (a fila de revisões vem da feature de revisão). */
  reviewsTab: ReactNode;
}

/** Histórico de versões congeladas: congelar, abrir o PDF, comparar e baixar o código. */
export function VersionHistorySheet({
  open,
  onOpenChange,
  projectId,
  projectName,
  canEdit,
  currentUid,
  memberProfiles,
  onCompare,
  onIssueSelect,
  reviewsTab,
}: VersionHistorySheetProps) {
  const { data: snapshots = [], isPending, isError } = useSnapshots(projectId, open);
  const { readSources } = useSnapshotFiles(projectId);
  const [pdfSnapshot, setPdfSnapshot] = useState<SnapshotSummary | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const authorOf = (uid: string) => (uid === currentUid ? 'por você' : (memberProfiles[uid]?.name ?? null));

  const handleDownload = async (snapshot: SnapshotSummary) => {
    setDownloadingId(snapshot.id);
    setNotice(null);
    try {
      const sources = await readSources(snapshot.files);
      const entries = snapshot.files.map((file) => ({ path: file.path, data: sources.get(file.path)! }));
      downloadBytes(buildZip(entries), `${slugify(projectName)}-v${snapshot.label}.zip`, 'application/zip');
    } catch {
      setNotice(`Não foi possível baixar o código da versão ${snapshot.label}.`);
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
          <SheetHeader className="pb-3 pr-10">
            <SheetTitle>Versões e revisões</SheetTitle>
            <SheetDescription>Cópias congeladas do projeto e as revisões pedidas sobre elas.</SheetDescription>
          </SheetHeader>
          <Tabs defaultValue="versions" className="flex min-h-0 flex-1 flex-col">
            <TabsList className="mx-4 grid grid-cols-2">
              <TabsTrigger value="versions">Versões</TabsTrigger>
              <TabsTrigger value="reviews">Revisões</TabsTrigger>
            </TabsList>
            <TabsContent value="reviews" className="min-h-0 flex-1 overflow-y-auto p-4">
              {reviewsTab}
            </TabsContent>
            <TabsContent value="versions" className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
              {canEdit && (
                <FreezeVersionForm
                  projectId={projectId}
                  projectName={projectName}
                  latest={snapshots[0]?.version ?? null}
                  onFrozen={(label) => setNotice(`Versão ${label} congelada.`)}
                  onIssueSelect={(issue) => {
                    onOpenChange(false);
                    onIssueSelect(issue);
                  }}
                />
              )}
              {notice && (
                <p role="status" className="text-sm text-muted-foreground">
                  {notice}
                </p>
              )}
              {isPending ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Carregando as versões
                </p>
              ) : isError ? (
                <p className="text-sm text-destructive">Não foi possível carregar as versões.</p>
              ) : snapshots.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhuma versão ainda. Congele a primeira para pedir revisão ou comparar alterações depois.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {snapshots.map((snapshot, index) => (
                    <VersionCard
                      key={snapshot.id}
                      snapshot={snapshot}
                      authorName={authorOf(snapshot.createdBy)}
                      isLatest={index === 0}
                      isDownloading={downloadingId === snapshot.id}
                      onOpenPdf={() => setPdfSnapshot(snapshot)}
                      onCompare={() => onCompare(snapshot.id)}
                      onDownload={() => void handleDownload(snapshot)}
                    />
                  ))}
                </ul>
              )}
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>
      <VersionPdfDialog projectId={projectId} projectName={projectName} snapshot={pdfSnapshot} onClose={() => setPdfSnapshot(null)} />
    </>
  );
}
