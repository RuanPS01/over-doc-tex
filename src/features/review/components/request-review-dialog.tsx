import { Check, Copy, ExternalLink, Loader2, Mail, Send } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FREEZE_STAGE_LABELS } from '@/features/snapshots/components/freeze-version-form';
import { IssueList } from '@/features/snapshots/components/issue-list';
import type { TexIssue } from '@/lib/latex/prepare';
import { FreezeError, useRequestReview, type RequestReviewResult, type RequestStage } from '../hooks/use-request-review';
import { reviewPath } from '../model/review';
import { normalizeEmail } from '@/lib/email';

const STAGE_LABELS: Record<RequestStage, string> = { ...FREEZE_STAGE_LABELS, opening: 'Abrindo a revisão' };

interface RequestReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
  onIssueSelect: (issue: TexIssue) => void;
}

/** Congela a versão (se mudou), abre a revisão e convida o revisor por e-mail. */
export function RequestReviewDialog({ open, onOpenChange, projectId, projectName, onIssueSelect }: RequestReviewDialogProps) {
  const requestReview = useRequestReview(projectId, projectName);
  const [email, setEmail] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
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
    if (!reviewerEmail) {
      setError('Informe um e-mail válido para o revisor.');
      return;
    }
    setError(null);
    setIssues([]);
    try {
      const created = await requestReview({
        reviewerEmail,
        title: title.trim() || `Revisão de ${projectName}`,
        description,
        onStage: setStage,
      });
      setResult({ ...created, email: reviewerEmail });
      setEmail('');
      setTitle('');
      setDescription('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível abrir a revisão.');
      if (caught instanceof FreezeError) setIssues(caught.issues);
    } finally {
      setStage(null);
    }
  };

  const link = result ? new URL(`${import.meta.env.BASE_URL}${reviewPath(projectId, result.reviewId).slice(1)}`, window.location.origin).href : '';
  const mailto = result
    ? `mailto:${result.email}?subject=${encodeURIComponent(`Revisão #${result.number}: ${projectName}`)}&body=${encodeURIComponent(
        `Olá! Você foi convidado para revisar a versão ${result.snapshotLabel} de "${projectName}".\n\nAbra: ${link}\n\nEntre com o Google ou com o link de acesso enviado para este e-mail.`,
      )}`
    : '';

  return (
    <Dialog open={open} onOpenChange={(next) => !isBusy && onOpenChange(next)}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{result ? `Revisão #${result.number} aberta` : 'Solicitar revisão'}</DialogTitle>
          <DialogDescription>
            {result
              ? `${result.email} pode ver o PDF da versão ${result.snapshotLabel} e comentar nele.`
              : 'O revisor vê só o PDF da versão congelada, nunca o rascunho. Se o código mudou desde a última versão, uma nova é congelada.'}
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="flex flex-col gap-3 text-sm">
            {result.frozeNewVersion && <p>A versão {result.snapshotLabel} foi congelada para esta revisão.</p>}
            <p className={result.emailSent ? undefined : 'rounded-md border border-warning/50 bg-warning/10 p-2'}>
              {result.emailSent
                ? 'O convite com o link de acesso foi enviado por e-mail.'
                : 'Não foi possível enviar o convite automático (ative "Link de e-mail" em Authentication no Firebase). Envie o link abaixo.'}
            </p>
            <div className="flex min-w-0 gap-2">
              <Input readOnly value={link} aria-label="Link da revisão" className="min-w-0 flex-1 font-mono text-xs" />
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
            <DialogFooter>
              <Button variant="outline" asChild>
                <a href={mailto}>
                  <Mail />
                  Enviar pelo meu e-mail
                </a>
              </Button>
              <Button asChild>
                <Link href={reviewPath(projectId, result.reviewId)}>
                  <ExternalLink />
                  Abrir a revisão
                </Link>
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm font-medium">
              E-mail do revisor
              <Input
                type="email"
                required
                autoComplete="off"
                disabled={isBusy}
                value={email}
                placeholder="revisor@universidade.br"
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Título
              <Input disabled={isBusy} value={title} maxLength={200} placeholder={`Revisão de ${projectName}`} onChange={(event) => setTitle(event.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Mensagem (opcional)
              <Textarea
                disabled={isBusy}
                value={description}
                rows={3}
                maxLength={2000}
                placeholder="O que o revisor deve olhar com atenção"
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
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
                Cancelar
              </Button>
              <Button type="submit" disabled={isBusy}>
                {isBusy ? <Loader2 className="animate-spin" /> : <Send />}
                {stage ? STAGE_LABELS[stage] : 'Solicitar revisão'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
