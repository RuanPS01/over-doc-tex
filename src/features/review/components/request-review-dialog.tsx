import { Loader2, Send } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FREEZE_STAGE_LABELS } from '@/features/snapshots/components/freeze-version-form';
import { IssueList } from '@/features/snapshots/components/issue-list';
import type { VersionBump } from '@/features/snapshots/model/version';
import { useT } from '@/hooks/use-t';
import { msg } from '@/lib/i18n';
import type { TexIssue } from '@/lib/latex/prepare';
import type { ReviewAccess } from '@shared/firestore/types';
import {
  FreezeError,
  MAX_REVIEWER_EMAILS,
  useNextReviewVersion,
  useRequestReview,
  type RequestReviewResult,
  type RequestStage,
} from '../hooks/use-request-review';
import { parseEmails } from '../model/review';
import { RequestReviewResultView } from './request-review-result';
import { ReviewAccessChoice } from './review-access-choice';
import { ReviewVersionNotice } from './review-version-notice';

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

/** Congela uma versão nova, abre a revisão e convida os revisores por e-mail ou pelo link. */
export function RequestReviewDialog({ open, onOpenChange, projectId, projectName, documents, onIssueSelect }: RequestReviewDialogProps) {
  const { t } = useT();
  const requestReview = useRequestReview(projectId, projectName);
  const nextVersion = useNextReviewVersion(projectId, open);
  const [access, setAccess] = useState<ReviewAccess>('email');
  const [emails, setEmails] = useState('');
  const [bump, setBump] = useState<VersionBump>('minor');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [secondaryIds, setSecondaryIds] = useState<string[]>([]);
  const secondaries = documents.filter((document) => document.role === 'secondary');
  const [stage, setStage] = useState<RequestStage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<TexIssue[]>([]);
  const [result, setResult] = useState<RequestReviewResult | null>(null);
  const isBusy = stage !== null;

  useEffect(() => {
    if (open) return;
    setResult(null);
    setError(null);
    setIssues([]);
    setBump('minor');
  }, [open]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    // Vários e-mails separados por vírgula (ponto e vírgula, espaço e linha também valem).
    const { valid, invalid } = parseEmails(emails);
    if (invalid.length > 0) return setError(t('E-mail inválido: {emails}.', { emails: invalid.join(', ') }));
    // Pelo link, o e-mail é opcional; por e-mail, é ele que dá o acesso.
    if (access === 'email' && valid.length === 0) return setError(t('Informe o e-mail de pelo menos um revisor.'));
    if (valid.length > MAX_REVIEWER_EMAILS) return setError(t('Convide até {max} e-mails por revisão.', { max: MAX_REVIEWER_EMAILS }));
    setError(null);
    setIssues([]);
    try {
      const created = await requestReview({
        access,
        reviewerEmails: valid,
        bump: nextVersion.isFirst ? 'minor' : bump,
        title: title.trim() || t('Revisão de {project}', { project: projectName }),
        description,
        documentIds: secondaryIds.filter((id) => secondaries.some((document) => document.id === id)),
        onStage: setStage,
      });
      setResult(created);
      setEmails('');
      setTitle('');
      setDescription('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('Não foi possível abrir a revisão.'));
      if (caught instanceof FreezeError) setIssues(caught.issues);
    } finally {
      setStage(null);
    }
  };

  const invited = result?.reviewerEmails ?? [];

  return (
    <Dialog open={open} onOpenChange={(next) => !isBusy && onOpenChange(next)}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{result ? t('Revisão #{number} aberta', { number: result.number }) : t('Solicitar revisão')}</DialogTitle>
          <DialogDescription>
            {!result
              ? t('Os revisores veem só o PDF da versão congelada, nunca o rascunho.')
              : result.linkToken
                ? t('Qualquer pessoa com o link pode ver o PDF da versão {version} e comentar nele, sem conta, informando o nome.', { version: result.snapshotLabel })
                : invited.length === 1
                  ? t('{email} pode ver o PDF da versão {version} e comentar nele.', { email: invited[0]!, version: result.snapshotLabel })
                  : t('{emails} podem ver o PDF da versão {version} e comentar nele.', { emails: invited.join(', '), version: result.snapshotLabel })}
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <RequestReviewResultView projectId={projectId} projectName={projectName} result={result} />
        ) : (
          <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-3">
            <ReviewVersionNotice
              labels={nextVersion.labels}
              isFirst={nextVersion.isFirst}
              isLoading={nextVersion.isLoading}
              bump={bump}
              disabled={isBusy}
              onBumpChange={setBump}
            />
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
                aria-describedby="request-review-emails-hint"
                onChange={(event) => setEmails(event.target.value)}
              />
              <span id="request-review-emails-hint" className="text-xs font-normal text-muted-foreground">
                {t('Separe vários e-mails por vírgula. Cada pessoa recebe o próprio link de acesso e vê os mesmos documentos.')}
              </span>
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
