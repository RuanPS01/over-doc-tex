import { Loader2, Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { MAX_PROJECT_NAME, normalizeProjectName } from '@/features/projects/model/new-project';
import { ReviewList } from '@/features/review/components/review-list';
import type { ReviewSummary } from '@/features/review/model/review';
import { useT } from '@/hooks/use-t';
import { usePdfRoomActions } from '../hooks/use-pdf-room-actions';

interface RoomDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  room: { id: string; name: string };
}

/** Novo nome da sala (o revisor também vê, nas rodadas). */
export function RenamePdfRoomDialog({ open, onOpenChange, room }: RoomDialogProps) {
  const { t } = useT();
  const { rename } = usePdfRoomActions();
  const [name, setName] = useState(room.name);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const normalized = normalizeProjectName(name);

  useEffect(() => {
    if (!open) return;
    setName(room.name);
    setError(null);
  }, [open, room.name]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!normalized) return;
    setIsSaving(true);
    setError(null);
    try {
      await rename(room.id, normalized);
      onOpenChange(false);
    } catch {
      setError(t('Não foi possível salvar. Confira a conexão e tente de novo.'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !isSaving && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{t('Renomear a sala')}</DialogTitle>
            <DialogDescription>{t('Os revisores passam a ver o nome novo em todas as rodadas.')}</DialogDescription>
          </DialogHeader>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {t('Nome da sala')}
            <Input autoFocus required maxLength={MAX_PROJECT_NAME} value={name} disabled={isSaving} onChange={(event) => setName(event.target.value)} />
          </label>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={isSaving} onClick={() => onOpenChange(false)}>
              {t('Cancelar')}
            </Button>
            <Button type="submit" disabled={!normalized || normalized === room.name || isSaving}>
              {isSaving && <Loader2 className="animate-spin" />}
              {t('Salvar')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Exclusão definitiva da sala (só o dono): PDFs, rodadas, comentários e desenhos. */
export function DeletePdfRoomDialog({ open, onOpenChange, room }: RoomDialogProps) {
  const { t } = useT();
  const { remove } = usePdfRoomActions();
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) setError(null);
  }, [open]);

  const confirm = async () => {
    setIsDeleting(true);
    setError(null);
    try {
      await remove(room.id);
      onOpenChange(false);
    } catch {
      setError(t('Não foi possível excluir tudo. Tente de novo: o que já saiu não volta, e o resto sai na próxima tentativa.'));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !isDeleting && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('Excluir "{room}"?', { room: room.name })}</DialogTitle>
          <DialogDescription>
            {t('O PDF de cada versão, as rodadas, os comentários e os desenhos são apagados para todos, inclusive para os revisores. Não dá para desfazer.')}
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={isDeleting} onClick={() => onOpenChange(false)}>
            {t('Cancelar')}
          </Button>
          <Button type="button" variant="destructive" disabled={isDeleting} onClick={() => void confirm()}>
            {isDeleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
            {isDeleting ? t('Excluindo') : t('Excluir a sala')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Todas as rodadas da sala, da mais nova para a mais antiga (cada uma abre a tela da revisão). */
export function PdfRoomRoundsDialog({ open, onOpenChange, room, rounds }: RoomDialogProps & { rounds: ReviewSummary[] }) {
  const { t } = useT();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('Rodadas de "{room}"', { room: room.name })}</DialogTitle>
          <DialogDescription>{t('Cada versão do PDF abriu uma rodada. As antigas continuam com os comentários delas.')}</DialogDescription>
        </DialogHeader>
        <ReviewList reviews={rounds} isPending={false} emptyText={t('Nenhuma rodada ainda.')} />
      </DialogContent>
    </Dialog>
  );
}
