import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { PdfDocumentView } from '@/features/pdf-viewer/components/pdf-document-view';
import { useT } from '@/hooks/use-t';
import { slugify } from '@/lib/download';
import { MAIN_DOCUMENT_ID } from '@/features/projects/model/new-project';
import { useSnapshotFiles } from '../hooks/use-snapshot-files';
import type { SnapshotSummary } from '../hooks/use-snapshots';

interface VersionPdfDialogProps {
  projectId: string;
  projectName: string;
  snapshot: SnapshotSummary | null;
  onClose: () => void;
}

/** PDF guardado de uma versão, em tela cheia no celular. */
export function VersionPdfDialog({ projectId, projectName, snapshot, onClose }: VersionPdfDialogProps) {
  const { t } = useT();
  const { readPdf } = useSnapshotFiles(projectId);
  const [pdf, setPdf] = useState<Uint8Array | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Mantém a última versão enquanto o diálogo fecha (a animação ainda mostra o conteúdo).
  const [shown, setShown] = useState<SnapshotSummary | null>(snapshot);
  if (snapshot && snapshot !== shown) setShown(snapshot);

  useEffect(() => {
    if (!snapshot) return;
    setPdf(null);
    setError(null);
    let cancelled = false;
    readPdf(snapshot.id, MAIN_DOCUMENT_ID)
      .then((data) => !cancelled && setPdf(data))
      .catch(() => !cancelled && setError(t('Não foi possível abrir o PDF desta versão.')));
    return () => {
      cancelled = true;
    };
  }, [snapshot, readPdf]);

  return (
    <Dialog open={snapshot !== null} onOpenChange={(open) => !open && onClose()}>
      {/* O X fica no meio da altura da barra do PDF (h-10), no espaço reservado pelo pr-10. */}
      <DialogContent
        className="flex h-[calc(100dvh-1rem)] max-w-4xl flex-col gap-0 overflow-hidden p-0"
        closeClassName="right-1 top-1 flex size-8 items-center justify-center p-0"
      >
        <DialogTitle className="sr-only">{t('PDF da versão {label}', { label: shown?.label ?? '' })}</DialogTitle>
        <DialogDescription className="sr-only">{t('Visualização do PDF guardado nesta versão.')}</DialogDescription>
        <div className="min-h-0 flex-1">
          <PdfDocumentView
            toolbarClassName="pr-10"
            outlineKey="version"
            pdf={pdf}
            error={error}
            title={t('Versão {label}', { label: shown?.label ?? '' })}
            fileName={`${slugify(projectName)}-v${shown?.label ?? ''}.pdf`}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
