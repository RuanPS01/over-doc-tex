import { Download, FileText, GitCompare, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SnapshotSummary } from '../hooks/use-snapshots';

const DATE_FORMAT = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

interface VersionCardProps {
  snapshot: SnapshotSummary;
  authorName: string | null;
  isLatest: boolean;
  isDownloading: boolean;
  onOpenPdf: () => void;
  onCompare: () => void;
  onDownload: () => void;
}

/** Uma versão congelada na lista do histórico. */
export function VersionCard({ snapshot, authorName, isLatest, isDownloading, onOpenPdf, onCompare, onDownload }: VersionCardProps) {
  const details = [
    snapshot.createdAt ? DATE_FORMAT.format(snapshot.createdAt) : null,
    authorName,
    `${snapshot.stats.pages} ${snapshot.stats.pages === 1 ? 'página' : 'páginas'}`,
    `${snapshot.stats.words.toLocaleString('pt-BR')} palavras`,
  ].filter(Boolean);

  return (
    <li className="flex flex-col gap-2 rounded-lg border bg-card p-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-sm font-semibold">{snapshot.label}</span>
        {isLatest && <span className="text-xs text-muted-foreground">mais recente</span>}
      </div>
      {snapshot.message && <p className="break-words text-sm">{snapshot.message}</p>}
      <p className="text-xs text-muted-foreground">{details.join(' · ')}</p>
      <div className="flex flex-wrap gap-1">
        <Button variant="outline" size="sm" onClick={onOpenPdf}>
          <FileText />
          Abrir PDF
        </Button>
        <Button variant="ghost" size="sm" onClick={onCompare}>
          <GitCompare />
          Comparar
        </Button>
        <Button variant="ghost" size="sm" disabled={isDownloading} onClick={onDownload}>
          {isDownloading ? <Loader2 className="animate-spin" /> : <Download />}
          Código (.zip)
        </Button>
      </div>
    </li>
  );
}
