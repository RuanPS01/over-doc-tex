import { Check, Copy, ExternalLink, Loader2, Mail, Send } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FREEZE_STAGE_LABELS } from '@/features/snapshots/components/freeze-version-form';
import { IssueList } from '@/features/snapshots/components/issue-list';
import { useT } from '@/hooks/use-t';
import { msg } from '@/lib/i18n';
import type { TexIssue } from '@/lib/latex/prepare';
import { FreezeError, useRequestReview, type RequestReviewResult, type RequestStage } from '../hooks/use-request-review';
import type { ReviewAccess } from '@shared/firestore/types';
import { reviewLinkUrl, reviewPath } from '../model/review';
import { normalizeEmail } from '@/lib/email';
import { ReviewAccessChoice } from './review-access-choice';

const STAGE_LABELS: Record<RequestStage, string> = { ...FREEZE_STAGE_LABELS, opening: msg('Abrindo a revisão'), diff: msg('Gerando a comparação em PDF'), carry: msg('Levando os comentários abertos') };

interface RequestReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
  /** Documentos do projeto; o principal sempre vai para o revisor. */
  documents: ReadonlyArray<{ id: string; title: string; role: 'main' | 'secondary'; rootPath: string }>;
  onIssueSelect: (issue: TexIssue) => void;
}

/** Congela a versão (se mudou), abre a revisão e convida o revisor por e-mail ou pelo link. */
export function RequestReviewDialog({ open, onOpenChange, projectId, projectName, documents, onIssueSelect }: RequestReviewDialogProps) {
  const { t } = useT();
  const requestReview = useRequestReview(projectId, projectName);
  const [access, setAccess] = useState<ReviewAccess>('email');
  const [email, setEmail] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [secondaryIds, setSecondaryIds] = useState<string[]>([]);
  const secondaries = documents.filter((document) => document.role === 'secondary');
  const [stage, setStage] = useState<RequestStage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<TexIssue[]>([]);
  const [result, setResult] = useState<(RequestReviewResult & { email: string }) | null>(null);
  const [copied, setCopied] = useState(false);
  const isBusy = stage !== null;

  useEffect(() => {
    if (open) return;
    setResult(null);
    setError(null);
    setIssues([]);
    setCopied(false);
  }, [open]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const reviewerEmail = normalizeEmail(email);
    // Pelo link, o e-mail é opcional; por e-mail, é ele que dá o acesso.
    if (!reviewerEmail && (access === 'email' || email.trim())) {
      setError(t('Informe um e-mail válido para o revisor.'));
      return;
    }
    setError(null);
    setIssues([]);
    try {
      const created = await requestReview({
        access,
        reviewerEmail: reviewerEmail ?? '',
        title: title.trim() || t('Revisão de {project}', { project: projectName }),
        description,
        documentIds: secondaryIds.filter((id) => secondaries.some((document) => document.id === id)),
        onStage: setStage,
      });
      setResult({ ...created, email: reviewerEmail ?? '' });
      setEmail('');
      setTitle('');
      setDescription('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('Não foi possível abrir a revisão.'));
      if (caught instanceof FreezeError) setIssues(caught.issues);
    } finally {
      setStage(null);
    }
  };

  // Pelo link, o endereço leva o código e a versão; por e-mail, é só o caminho da revisão.
  const link = !result
    ? ''
    : result.linkToken
      ? reviewLinkUrl(window.location.origin, import.meta.env.BASE_URL, { projectId, id: result.reviewId, snapshotId: result.snapshotId }, result.linkToken)
      : new URL(`${import.meta.env.BASE_URL}${reviewPath(projectId, result.reviewId).slice(1)}`, window.location.origin).href;
  const mailto = result
    ? `mailto:${result.email}?subject=${encodeURIComponent(t('Revisão #{number}: {project}', { number: result.number, project: projectName }))}&body=${encodeURIComponent(
        result.linkToken
          ? t('Olá! Você foi convidado para revisar a versão {version} de "{project}".\n\nAbra: {link}\n\nNão precisa de conta: basta informar o seu nome.', {
              version: result.snapshotLabel,
              project: projectName,
              link,
            })
          : t('Olá! Você foi convidado para revisar a versão {version} de "{project}".\n\nAbra: {link}\n\nEntre com o Google ou com o link de acesso enviado para este e-mail.', {
              version: result.snapshotLabel,
              project: projectName,
              link,
            }),
      )}`
    : '';

  return (
    <Dialog open={open} onOpenChange={(next) => !isBusy && onOpenChange(next)}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{result ? t('Revisão #{number} aberta', { number: result.number }) : t('Solicitar revisão')}</DialogTitle>
          <DialogDescription>
            {result
              ? result.linkToken
                ? t('Qualquer pessoa com o link pode ver o PDF da versão {version} e comentar nele, sem conta, informando o nome.', { version: result.snapshotLabel })
                : t('{email} pode ver o PDF da versão {version} e comentar nele.', { email: result.email, version: result.snapshotLabel })
              : t('O revisor vê só o PDF da versão congelada, nunca o rascunho. Se o código mudou desde a última versão, uma nova é congelada.')}
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="flex flex-col gap-3 text-sm">
            {result.frozeNewVersion && <p>{t('A versão {version} foi congelada para esta revisão.', { version: result.snapshotLabel })}</p>}
            {result.carriedThreads > 0 && (
              <p>
                {result.carriedThreads === 1
                  ? t('1 comentário ainda aberto da rodada anterior veio junto.')
                  : t('{count} comentários ainda abertos da rodada anterior vieram junto.', { count: result.carriedThreads })}
              </p>
            )}
            {result.email ? (
              <p className={result.emailSent ? undefined : 'rounded-md border border-warning/50 bg-warning/10 p-2'}>
                {result.emailSent
                  ? t('O convite com o link de acesso foi enviado por e-mail.')
                  : t('Não foi possível enviar o convite automático (ative "Link de e-mail" em Authentication no Firebase). Envie o link abaixo.')}
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
              {result.email && (
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
        ) : (
          <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-3">
            <ReviewAccessChoice value={access} disabled={isBusy} onChange={setAccess} />
            <label className="flex flex-col gap-1 text-sm font-medium">
              {access === 'link' ? t('E-mail do revisor (opcional)') : t('E-mail do revisor')}
              <Input
                type="email"
                required={access === 'email'}
                autoComplete="off"
                disabled={isBusy}
                value={email}
                placeholder={t('revisor@universidade.br')}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              {t('Título')}
              <Input disabled={isBusy} value={title} maxLength={200} placeholder={t('Revisão de {project}', { project: projectName })} onChange={(event) => setTitle(event.target.value)} />
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
            {secondaries.length > 0 && (
              <fieldset className="flex flex-col gap-1.5 text-sm">
                <legend className="mb-1 font-medium">{t('Documentos que o revisor vê')}</legend>
                <label className="flex items-center gap-2 text-muted-foreground">
                  <input type="checkbox" checked disabled className="size-4 accent-primary" />
                  {t('{title} (principal)', { title: documents.find((document) => document.role === 'main')?.title ?? t('Documento principal') })}
                </label>
                {secondaries.map((document) => (
                  <label key={document.id} className="flex min-w-0 items-center gap-2">
                    <input
                      type="checkbox"
                      disabled={isBusy}
                      className="size-4 shrink-0 accent-primary"
                      checked={secondaryIds.includes(document.id)}
                      onChange={(event) =>
                        setSecondaryIds((ids) => (event.target.checked ? [...ids, document.id] : ids.filter((id) => id !== document.id)))
                      }
                    />
                    <span className="min-w-0 truncate">
                      {document.title} <span className="text-muted-foreground">({document.rootPath})</span>
                    </span>
                  </label>
                ))}
              </fieldset>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <IssueList
              issues={issues}
              onSelect={(issue) => {
                onOpenChange(false);
                onIssueSelect(issue);
              }}
            />
            <DialogFooter>
              <Button type="button" variant="outline" disabled={isBusy} onClick={() => onOpenChange(false)}>
                {t('Cancelar')}
              </Button>
              <Button type="submit" disabled={isBusy}>
                {isBusy ? <Loader2 className="animate-spin" /> : <Send />}
                {stage ? t(STAGE_LABELS[stage]) : t('Solicitar revisão')}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
