import { ExternalLink, FileSearch, FileUp, History, MoreVertical, Pencil, Share2, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ReviewSharingDialog } from '@/features/review/components/review-sharing-dialog';
import { REVIEW_STATUS_LABELS, reviewPath, reviewerLabel } from '@/features/review/model/review';
import { useT } from '@/hooks/use-t';
import { usePdfRoomRounds, usePdfRooms, type PdfRoomSummary } from '../hooks/use-pdf-rooms';
import { DeletePdfRoomDialog, PdfRoomRoundsDialog, RenamePdfRoomDialog } from './pdf-room-dialogs';
import { PdfRoundDialog } from './pdf-round-dialog';

type RoomDialog = 'version' | 'sharing' | 'rounds' | 'rename' | 'delete';

/** Uma sala: abre a rodada mais recente; o menu envia versão nova, ajusta o envio, lista rodadas, renomeia e exclui. */
function PdfRoomCard({ room }: { room: PdfRoomSummary }) {
  const { t, locale } = useT();
  const { data: rounds = [], isPending } = usePdfRoomRounds(room.id);
  const [dialog, setDialog] = useState<RoomDialog | null>(null);
  const dateFormat = useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle: 'short' }), [locale]);
  const latest = rounds[0] ?? null;
  const canEdit = room.role === 'owner' || room.role === 'editor';
  const close = (open: boolean) => !open && setDialog(null);

  const subtitle = latest
    ? [
        t('versão {version}', { version: latest.snapshotLabel }),
        t(REVIEW_STATUS_LABELS[latest.status]),
        reviewerLabel(latest),
        room.updatedAt ? dateFormat.format(room.updatedAt) : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : isPending
      ? t('Carregando as revisões')
      : t('Nenhum PDF enviado ainda');

  const body = (
    <>
      <FileSearch className="size-5 shrink-0 text-primary" aria-hidden />
      <span className="min-w-0">
        <span className="block truncate font-medium">{room.name}</span>
        <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
      </span>
    </>
  );
  const bodyClass = 'flex min-w-0 flex-1 items-center gap-3 rounded-l-lg p-4 text-left transition-colors hover:bg-muted';

  return (
    <li className="flex min-w-0 items-stretch rounded-lg border bg-card">
      {latest ? (
        <Link href={reviewPath(room.id, latest.id)} className={bodyClass}>
          {body}
        </Link>
      ) : (
        <button type="button" className={bodyClass} disabled={!canEdit || isPending} onClick={() => setDialog('version')}>
          {body}
        </button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="m-2 shrink-0 self-center" aria-label={t('Ações da sala {room}', { room: room.name })}>
            <MoreVertical />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {latest && (
            <DropdownMenuItem asChild>
              <Link href={reviewPath(room.id, latest.id)}>
                <ExternalLink />
                {t('Abrir a revisão')}
              </Link>
            </DropdownMenuItem>
          )}
          {latest && canEdit && (
            <DropdownMenuItem onSelect={() => setDialog('sharing')}>
              <Share2 />
              {t('Envio da revisão')}
            </DropdownMenuItem>
          )}
          {canEdit && (
            <DropdownMenuItem onSelect={() => setDialog('version')}>
              <FileUp />
              {latest ? t('Nova versão do PDF') : t('Enviar o PDF')}
            </DropdownMenuItem>
          )}
          {rounds.length > 0 && (
            <DropdownMenuItem onSelect={() => setDialog('rounds')}>
              <History />
              {t('Rodadas ({count})', { count: rounds.length })}
            </DropdownMenuItem>
          )}
          {canEdit && (
            <DropdownMenuItem onSelect={() => setDialog('rename')}>
              <Pencil />
              {t('Renomear')}
            </DropdownMenuItem>
          )}
          {room.role === 'owner' && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDialog('delete')}>
                <Trash2 />
                {t('Excluir a sala')}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <PdfRoundDialog open={dialog === 'version'} onOpenChange={close} room={room} latestRound={latest} />
      {latest && canEdit && <ReviewSharingDialog open={dialog === 'sharing'} onOpenChange={close} review={latest} />}
      <PdfRoomRoundsDialog open={dialog === 'rounds'} onOpenChange={close} room={room} rounds={rounds} />
      <RenamePdfRoomDialog open={dialog === 'rename'} onOpenChange={close} room={room} />
      <DeletePdfRoomDialog open={dialog === 'delete'} onOpenChange={close} room={room} />
    </li>
  );
}

/**
 * "Revisões de PDF avulso" na tela inicial: salas de revisão de um PDF
 * anexado, separadas dos projetos LaTeX. Cada sala guarda as versões do PDF e
 * as rodadas de revisão delas.
 */
export function PdfRoomsSection() {
  const { t } = useT();
  const { rooms, isPending, isError } = usePdfRooms();
  const [creating, setCreating] = useState(false);

  // O erro de carga já aparece na lista de projetos, logo acima.
  if (isError) return null;

  return (
    <section className="flex flex-col gap-3" aria-labelledby="pdf-rooms-title">
      <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1 basis-60">
          <h2 id="pdf-rooms-title" className="text-base font-semibold">
            {t('Revisões de PDF avulso')}
          </h2>
          <p className="text-xs text-muted-foreground">{t('Anexe qualquer PDF para receber comentários e desenhos, sem projeto LaTeX.')}</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
          <FileUp />
          {t('Revisar um PDF')}
        </Button>
      </div>
      {isPending ? (
        <div className="h-[74px] animate-pulse rounded-lg border bg-muted/40" aria-busy="true" aria-label={t('Carregando as salas de revisão')} />
      ) : rooms.length === 0 ? (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex flex-col items-start gap-1 rounded-lg border border-dashed p-4 text-left text-sm transition-colors hover:bg-muted"
        >
          <span className="font-medium">{t('Nenhuma sala de revisão de PDF.')}</span>
          <span className="text-muted-foreground">{t('Envie um PDF, convide revisores por e-mail ou pelo link e acompanhe os comentários aqui.')}</span>
        </button>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {rooms.map((room) => (
            <PdfRoomCard key={room.id} room={room} />
          ))}
        </ul>
      )}
      <PdfRoundDialog open={creating} onOpenChange={setCreating} room={null} />
    </section>
  );
}
