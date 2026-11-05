import { Check, Copy, ExternalLink, Mail } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useT } from '@/hooks/use-t';
import type { RequestReviewResult } from '../hooks/use-request-review';
import { reviewLinkUrl, reviewPath } from '../model/review';

interface RequestReviewResultViewProps {
  projectId: string;
  projectName: string;
  result: RequestReviewResult;
}

/** Revisão aberta: versão congelada, convites enviados, link para copiar e "Abrir a revisão". */
export function RequestReviewResultView({ projectId, projectName, result }: RequestReviewResultViewProps) {
  const { t } = useT();
  const [copied, setCopied] = useState(false);
  const emails = result.reviewerEmails;
  const failed = emails.length - result.emailsSent;

  // Pelo link, o endereço leva o código e a versão; por e-mail, é só o caminho da revisão.
  const link = result.linkToken
    ? reviewLinkUrl(window.location.origin, import.meta.env.BASE_URL, { projectId, id: result.reviewId, snapshotId: result.snapshotId }, result.linkToken)
    : new URL(`${import.meta.env.BASE_URL}${reviewPath(projectId, result.reviewId).slice(1)}`, window.location.origin).href;
  const body = result.linkToken
    ? t('Olá! Você foi convidado para revisar a versão {version} de "{project}".\n\nAbra: {link}\n\nNão precisa de conta: basta informar o seu nome.', {
        version: result.snapshotLabel,
        project: projectName,
        link,
      })
    : t('Olá! Você foi convidado para revisar a versão {version} de "{project}".\n\nAbra: {link}\n\nEntre com o Google ou com o link de acesso enviado para este e-mail.', {
        version: result.snapshotLabel,
        project: projectName,
        link,
      });
  // Vários destinatários no mesmo mailto, separados por vírgula (RFC 6068).
  const mailto = `mailto:${emails.join(',')}?subject=${encodeURIComponent(
    t('Revisão #{number}: {project}', { number: result.number, project: projectName }),
  )}&body=${encodeURIComponent(body)}`;

  return (
    <div className="flex flex-col gap-3 text-sm">
      <p>{t('A versão {version} foi congelada para esta revisão.', { version: result.snapshotLabel })}</p>
      {result.carriedThreads > 0 && (
        <p>
          {result.carriedThreads === 1
            ? t('1 comentário ainda aberto da rodada anterior veio junto.')
            : t('{count} comentários ainda abertos da rodada anterior vieram junto.', { count: result.carriedThreads })}
        </p>
      )}
      {emails.length > 0 ? (
        <p className={failed === 0 ? undefined : 'rounded-md border border-warning/50 bg-warning/10 p-2'}>
          {failed === 0
            ? emails.length === 1
              ? t('O convite com o link de acesso foi enviado por e-mail.')
              : t('Os {count} convites com o link de acesso foram enviados por e-mail.', { count: emails.length })
            : failed === emails.length
              ? t('Não foi possível enviar o convite automático (ative "Link de e-mail" em Authentication no Firebase). Envie o link abaixo.')
              : t('O convite automático falhou para {failed} de {count} e-mails (ative "Link de e-mail" em Authentication no Firebase). Envie o link abaixo.', {
                  failed,
                  count: emails.length,
                })}
        </p>
      ) : (
        <p>{t('Envie o link abaixo para quem vai revisar. Quem tiver o link entra sem conta.')}</p>
      )}
      <div className="flex min-w-0 gap-2">
        <Input readOnly value={link} aria-label={t('Link da revisão')} className="min-w-0 flex-1 font-mono text-xs" />
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={t('Copiar link')}
          onClick={() => void navigator.clipboard.writeText(link).then(() => setCopied(true))}
        >
          {copied ? <Check /> : <Copy />}
        </Button>
      </div>
      <DialogFooter>
        {emails.length > 0 && (
          <Button variant="outline" asChild>
            <a href={mailto}>
              <Mail />
              {t('Enviar pelo meu e-mail')}
            </a>
          </Button>
        )}
        <Button asChild>
          <Link href={reviewPath(projectId, result.reviewId)}>
            <ExternalLink />
            {t('Abrir a revisão')}
          </Link>
        </Button>
      </DialogFooter>
    </div>
  );
}
