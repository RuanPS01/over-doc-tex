import { FileUp, Loader2, Send } from 'lucide-react';
import { useEffect, useRef, useState, type DragEvent, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { MAX_PROJECT_NAME, normalizeProjectName } from '@/features/projects/model/new-project';
import { RequestReviewResultView } from '@/features/review/components/request-review-result';
import { ReviewAccessChoice } from '@/features/review/components/review-access-choice';
import { ReviewVersionNotice } from '@/features/review/components/review-version-notice';
import { MAX_REVIEWER_EMAILS, parseEmails, type ReviewSummary } from '@/features/review/model/review';
import type { VersionBump } from '@/features/snapshots/model/version';
import { useT } from '@/hooks/use-t';
import { msg } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { ReviewAccess } from '@shared/firestore/types';
import { useNextPdfVersion } from '../hooks/use-pdf-rooms';
import { PublishPdfError, usePublishPdf, type PublishPdfResult, type PublishPdfStage } from '../hooks/use-publish-pdf';
import { MAX_PDF_BYTES, formatBytes, roomNameFromFile } from '../model/pdf-room';

const STAGE_LABELS: Record<PublishPdfStage, string> = {
  reading: msg('Lendo o PDF'),
  uploading: msg('Enviando o PDF'),
  opening: msg('Abrindo a revisão'),
  carry: msg('Levando os comentários abertos'),
};

interface PdfRoundDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Sala existente (nova versão do PDF) ou nula (sala nova). */
  room: { id: string; name: string } | null;
  /** Rodada mais recente da sala: a nova herda dela o tipo de acesso e os e-mails. */
  latestRound?: ReviewSummary | null;
}

/**
 * Envia um PDF para revisão: numa sala nova (com o nome dela) ou como versão
 * nova de uma sala existente. Cada envio abre uma rodada com os mesmos
 * convites de "Solicitar revisão": e-mails com login ou link sem conta.
 */
export function PdfRoundDialog({ open, onOpenChange, room, latestRound = null }: PdfRoundDialogProps) {
  const { t, locale } = useT();
  const publish = usePublishPdf(room?.id ?? null);
  const nextVersion = useNextPdfVersion(room?.id ?? null, open);
  const isFirst = room === null || nextVersion.isFirst;
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [name, setName] = useState('');
  const [access, setAccess] = useState<ReviewAccess>('email');
  const [emails, setEmails] = useState('');
  const [bump, setBump] = useState<VersionBump>('minor');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [closePrevious, setClosePrevious] = useState(true);
  const [stage, setStage] = useState<PublishPdfStage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PublishPdfResult | null>(null);
  const isBusy = stage !== null;
  const canClosePrevious = latestRound !== null && latestRound.status !== 'closed';
  // A rodada chega em tempo real (objeto novo a cada mudança): só a leitura na abertura conta.
  const latestRef = useRef(latestRound);
  latestRef.current = latestRound;

  // Ao abrir: a rodada nova herda o acesso e os e-mails da anterior. Ao fechar: tudo limpo.
  useEffect(() => {
    if (open) {
      setAccess(latestRef.current?.access ?? 'email');
      setEmails(latestRef.current?.reviewerEmails.join(', ') ?? '');
      return;
    }
    setFile(null);
    setName('');
    setEmails('');
    setTitle('');
    setDescription('');
    setBump('minor');
    setClosePrevious(true);
    setError(null);
    setResult(null);
  }, [open]);

  const pick = (picked: File | undefined | null) => {
    if (!picked) return;
    setError(null);
    if (picked.size > MAX_PDF_BYTES) return setError(t('O PDF passa de 50 MB, o limite de cada versão.'));
    setFile(picked);
    if (!room && !name.trim()) setName(roomNameFromFile(picked.name));
  };

  const handleDrop = (event: DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
    if (!isBusy) pick(event.dataTransfer.files[0]);
  };

  const roomName = room?.name ?? normalizeProjectName(name);
  const defaultTitle = room ? (latestRound?.title ?? room.name) : (roomName ?? '');

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!file) return setError(t('Escolha o PDF que vai ser revisado.'));
    if (!roomName) return setError(t('Dê um nome para a sala de revisão.'));
    const { valid, invalid } = parseEmails(emails);
    if (invalid.length > 0) return setError(t('E-mail inválido: {emails}.', { emails: invalid.join(', ') }));
    if (access === 'email' && valid.length === 0) return setError(t('Informe o e-mail de pelo menos um revisor.'));
    if (valid.length > MAX_REVIEWER_EMAILS) return setError(t('Convide até {max} e-mails por revisão.', { max: MAX_REVIEWER_EMAILS }));
    setError(null);
    try {
      const data = new Uint8Array(await file.arrayBuffer());
      setResult(
        await publish({
          roomName,
          file: { name: file.name, data },
          bump: isFirst ? 'minor' : bump,
          access,
          reviewerEmails: valid,
          title: title.trim() || defaultTitle,
          description,
          closePrevious: canClosePrevious && closePrevious,
          onStage: setStage,
        }),
      );
    } catch (caught) {
      setError(caught instanceof PublishPdfError ? caught.message : t('Não foi possível enviar o PDF. Confira a conexão e tente de novo.'));
    } finally {
      setStage(null);
    }
  };

  const invited = result?.reviewerEmails ?? [];
  const version = isFirst ? nextVersion.labels.minor : nextVersion.labels[bump];

  return (
    <Dialog open={open} onOpenChange={(next) => !isBusy && onOpenChange(next)}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {result
              ? room
                ? t('Rodada #{number} aberta', { number: result.number })
                : t('Sala de revisão aberta')
              : room
                ? t('Nova versão do PDF')
                : t('Revisar um PDF')}
          </DialogTitle>
          <DialogDescription>
            {!result
              ? room
                ? t('O PDF novo vira a versão seguinte de "{room}" e abre uma rodada de revisão.', { room: room.name })
                : t('Anexe qualquer PDF: os revisores comentam trechos, marcam pontos e desenham nele, como numa revisão de projeto.')
              : result.linkToken
                ? t('Qualquer pessoa com o link pode ver o PDF da versão {version} e comentar nele, sem conta, informando o nome.', { version: result.snapshotLabel })
                : invited.length === 1
                  ? t('{email} pode ver o PDF da versão {version} e comentar nele.', { email: invited[0]!, version: result.snapshotLabel })
                  : t('{emails} podem ver o PDF da versão {version} e comentar nele.', { emails: invited.join(', '), version: result.snapshotLabel })}
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <RequestReviewResultView
            projectId={result.roomId}
            projectName={roomName ?? ''}
            result={result}
            summary={t('O PDF enviado é a versão {version} desta sala.', { version: result.snapshotLabel })}
          />
        ) : (
          <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-3">
            <label
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={cn(
                'flex cursor-pointer flex-col items-center gap-1 rounded-md border border-dashed p-4 text-center text-sm transition-colors hover:bg-muted has-[:disabled]:cursor-default has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
                isDragging && 'border-primary bg-muted',
              )}
            >
              <input
                type="file"
                accept="application/pdf,.pdf"
                className="sr-only"
                disabled={isBusy}
                onChange={(event) => {
                  pick(event.target.files?.[0]);
                  event.target.value = '';
                }}
              />
              <FileUp className="size-5 text-muted-foreground" aria-hidden />
              {file ? (
                <>
                  <span className="max-w-full truncate font-medium" title={file.name}>
                    {file.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatBytes(file.size, locale)} · {t('Escolher outro PDF')}
                  </span>
                </>
              ) : (
                <>
                  <span className="font-medium">{t('Escolha o PDF ou arraste-o para cá')}</span>
                  <span className="text-xs text-muted-foreground">{t('Até 50 MB por versão.')}</span>
                </>
              )}
            </label>
            {room ? (
              <ReviewVersionNotice
                labels={nextVersion.labels}
                isFirst={isFirst}
                isLoading={nextVersion.isLoading}
                bump={bump}
                disabled={isBusy}
                onBumpChange={setBump}
                title={t('O PDF enviado vira a versão {version}', { version })}
                description={t('As versões anteriores continuam guardadas. Os comentários ainda abertos vêm para a rodada nova.')}
              />
            ) : (
              <label className="flex flex-col gap-1 text-sm font-medium">
                {t('Nome da sala')}
                <Input
                  required
                  disabled={isBusy}
                  value={name}
                  maxLength={MAX_PROJECT_NAME}
                  placeholder={t('Ex.: Artigo para a conferência')}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
            )}
            <ReviewAccessChoice value={access} disabled={isBusy} onChange={setAccess} />
            <label className="flex flex-col gap-1 text-sm font-medium">
              {access === 'link' ? t('E-mails dos revisores (opcional)') : t('E-mails dos revisores')}
              <Input
                type="text"
                inputMode="email"
                autoComplete="off"
                spellCheck={false}
                disabled={isBusy}
                value={emails}
                placeholder={t('revisora@universidade.br, orientador@universidade.br')}
                aria-describedby="pdf-round-emails-hint"
                onChange={(event) => setEmails(event.target.value)}
              />
              <span id="pdf-round-emails-hint" className="text-xs font-normal text-muted-foreground">
                {t('Separe vários e-mails por vírgula. Cada pessoa recebe o próprio link de acesso.')}
              </span>
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              {t('Título')}
              <Input disabled={isBusy} value={title} maxLength={200} placeholder={defaultTitle} onChange={(event) => setTitle(event.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              {t('Mensagem (opcional)')}
              <Textarea
                disabled={isBusy}
                value={description}
                rows={3}
                maxLength={2000}
                placeholder={t('O que o revisor deve olhar com atenção')}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
            {canClosePrevious && (
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  disabled={isBusy}
                  className="mt-0.5 size-4 shrink-0 accent-primary"
                  checked={closePrevious}
                  onChange={(event) => setClosePrevious(event.target.checked)}
                />
                <span>{t('Encerrar a rodada anterior (#{number}) ao abrir a nova', { number: latestRound.number })}</span>
              </label>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" disabled={isBusy} onClick={() => onOpenChange(false)}>
                {t('Cancelar')}
              </Button>
              <Button type="submit" disabled={isBusy}>
                {isBusy ? <Loader2 className="animate-spin" /> : <Send />}
                {stage ? t(STAGE_LABELS[stage]) : room ? t('Enviar a versão') : t('Abrir a sala de revisão')}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
