import { Check, Copy, Loader2, RefreshCw, UserPlus } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import type { ReviewAccess } from '@shared/firestore/types';
import { useReviewSharing } from '../hooks/use-review-sharing';
import { parseEmails, reviewLinkUrl, type ReviewSummary } from '../model/review';
import { ReviewAccessChoice } from './review-access-choice';

interface ReviewSharingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  review: ReviewSummary;
}

/**
 * "Envio da revisão" (dono e editores, no cabeçalho da revisão): quem pode
 * abrir (e-mails convidados ou qualquer pessoa com o link), o link sem conta
 * com "Copiar" e "Gerar novo link", e mais e-mails convidados.
 */
export function ReviewSharingDialog({ open, onOpenChange, review }: ReviewSharingDialogProps) {
  const sharing = useReviewSharing(review, open);
  const [busy, setBusy] = useState<'access' | 'link' | 'emails' | null>(null);
  const [emails, setEmails] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);

  useEffect(() => {
    if (open) return;
    setMessage(null);
    setError(null);
    setCopied(false);
    setConfirmRegenerate(false);
  }, [open]);

  const run = async (kind: NonNullable<typeof busy>, action: () => Promise<string | null>) => {
    setBusy(kind);
    setError(null);
    setMessage(null);
    try {
      setMessage(await action());
    } catch (caught) {
      setError(caught instanceof Error && caught.message ? caught.message : 'Não foi possível salvar. Confira a conexão e tente de novo.');
    } finally {
      setBusy(null);
    }
  };

  const changeAccess = (access: ReviewAccess) => {
    if (access === review.access) return;
    void run('access', async () => {
      await sharing.setAccess(access);
      return access === 'link' ? 'Pronto: qualquer pessoa com o link pode revisar sem conta.' : 'Pronto: só os e-mails convidados abrem a revisão. Quem entrou pelo link perdeu o acesso.';
    });
  };

  const regenerate = () => {
    if (!confirmRegenerate) return setConfirmRegenerate(true);
    setConfirmRegenerate(false);
    setCopied(false);
    void run('link', async () => {
      await sharing.regenerateLink();
      return 'Link novo gerado. O anterior parou de funcionar.';
    });
  };

  const invite = (event: FormEvent) => {
    event.preventDefault();
    const { valid, invalid } = parseEmails(emails);
    if (invalid.length > 0) return setError(`E-mail inválido: ${invalid.join(', ')}.`);
    if (valid.length === 0) return setError('Informe pelo menos um e-mail.');
    void run('emails', async () => {
      const { added, emailed } = await sharing.addEmails(valid);
      setEmails('');
      if (added === 0) return 'Esses e-mails já estavam convidados.';
      const who = added === 1 ? '1 e-mail convidado' : `${added} e-mails convidados`;
      return emailed === added
        ? `${who}; o link de acesso foi enviado por e-mail.`
        : `${who}. O envio automático falhou para ${added - emailed} (ative "Link de e-mail" no Firebase Authentication) e o convite pode ser mandado pelo link da revisão.`;
    });
  };

  const link = sharing.token ? reviewLinkUrl(window.location.origin, import.meta.env.BASE_URL, review, sharing.token) : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Envio da revisão #{review.number}</DialogTitle>
          <DialogDescription>Quem pode abrir esta revisão e quem foi convidado. As mudanças valem na hora.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 text-sm">
          <ReviewAccessChoice value={review.access} disabled={busy !== null} onChange={changeAccess} />

          {review.access === 'link' && (
            <section className="flex flex-col gap-2">
              <h3 className="font-medium">Link de acesso sem conta</h3>
              {sharing.isLoadingLinks || busy === 'access' ? (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Preparando o link
                </p>
              ) : link ? (
                <>
                  <div className="flex min-w-0 gap-2">
                    <Input readOnly value={link} aria-label="Link da revisão sem conta" className="min-w-0 flex-1 font-mono text-xs" />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label="Copiar link"
                      onClick={() => void navigator.clipboard.writeText(link).then(() => setCopied(true))}
                    >
                      {copied ? <Check /> : <Copy />}
                    </Button>
                  </div>
                  <Button type="button" variant="ghost" size="sm" className="self-start" disabled={busy !== null} onClick={regenerate}>
                    {busy === 'link' ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                    {confirmRegenerate ? 'Clique de novo: o link atual vai parar de funcionar' : 'Gerar novo link'}
                  </Button>
                </>
              ) : (
                <Button type="button" variant="outline" size="sm" className="self-start" disabled={busy !== null} onClick={regenerate}>
                  <RefreshCw />
                  Gerar o link
                </Button>
              )}
            </section>
          )}

          <section className="flex flex-col gap-2">
            <h3 className="font-medium">E-mails convidados</h3>
            {review.reviewerEmails.length > 0 ? (
              <ul className="flex flex-wrap gap-1.5">
                {review.reviewerEmails.map((email) => (
                  <li key={email} className="max-w-full truncate rounded-full border bg-muted/50 px-2.5 py-0.5 text-xs">
                    {email}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">Ninguém foi convidado por e-mail ainda.</p>
            )}
            <form onSubmit={invite} className="flex min-w-0 flex-col gap-2 sm:flex-row">
              <Input
                value={emails}
                disabled={busy !== null}
                aria-label="E-mails para convidar"
                placeholder="revisora@universidade.br, outro@empresa.com"
                onChange={(event) => setEmails(event.target.value)}
                className="min-w-0 flex-1"
              />
              <Button type="submit" disabled={busy !== null || !emails.trim()}>
                {busy === 'emails' ? <Loader2 className="animate-spin" /> : <UserPlus />}
                Convidar
              </Button>
            </form>
            <p className="text-xs text-muted-foreground">
              Cada e-mail recebe o link de acesso e vê os mesmos documentos desta revisão. Com acesso pelo link, os convidados por e-mail também
              podem entrar com a conta deles.
            </p>
          </section>

          {message && (
            <p role="status" className="rounded-md bg-success/15 p-2 text-success">
              {message}
            </p>
          )}
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
