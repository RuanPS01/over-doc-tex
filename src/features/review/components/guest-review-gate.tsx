import { useQueryClient } from '@tanstack/react-query';
import { Loader2, LogIn, UserRound } from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useSearch } from 'wouter';
import { FullPageStatus } from '@/components/common/full-page-status';
import { PageCornerBar } from '@/components/common/page-corner-bar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useT } from '@/hooks/use-t';
import type { GuestIdentity } from '../hooks/use-review-actions';
import { reviewKey } from '../hooks/use-review';
import { useReviewGuest } from '../hooks/use-review-guest';
import { guestKeyOf } from '../model/review';

interface GuestReviewGateProps {
  projectId: string;
  reviewId: string;
  snapshotId: string;
  token: string;
  children: (identity: GuestIdentity, changeName: () => void) => ReactNode;
}

function GuestNameForm({ suggestion, isSaving, onSubmit }: { suggestion: string; isSaving: boolean; onSubmit: (name: string) => void }) {
  const { t } = useT();
  const [name, setName] = useState(suggestion);
  // Depois de entrar (ou criar a conta), o login volta para este mesmo link.
  const [location] = useLocation();
  const search = useSearch();
  const loginHref = `/login?next=${encodeURIComponent(`${location}${search ? `?${search}` : ''}`)}`;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (guestKeyOf(name)) onSubmit(name);
  };
  return (
    <div className="flex min-h-viewport items-center justify-center px-4">
      <PageCornerBar />
      <form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-4 rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-1.5">
          <UserRound className="size-6 text-primary" aria-hidden />
          <h1 className="text-lg font-semibold">{t('Revisão pelo link')}</h1>
          <p className="text-sm text-muted-foreground">
            {t(
              'Informe o seu nome para comentar no PDF. Ele aparece nos seus comentários e fica guardado neste navegador. Em outro aparelho, use o mesmo nome para continuar como o mesmo revisor.',
            )}
          </p>
        </div>
        <label className="flex flex-col gap-1 text-sm font-medium">
          {t('Seu nome')}
          <Input value={name} autoFocus maxLength={80} autoComplete="name" disabled={isSaving} onChange={(event) => setName(event.target.value)} />
        </label>
        <Button type="submit" disabled={isSaving || !guestKeyOf(name)}>
          {isSaving && <Loader2 className="animate-spin" />}
          {t('Começar a revisar')}
        </Button>
        <div className="flex items-center gap-3 text-xs text-muted-foreground" aria-hidden>
          <span className="h-px flex-1 bg-border" />
          {t('ou')}
          <span className="h-px flex-1 bg-border" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Button asChild variant="outline" className={isSaving ? 'pointer-events-none opacity-50' : undefined}>
            <Link href={loginHref}>
              <LogIn />
              {t('Entrar ou criar conta')}
            </Link>
          </Button>
          <p className="text-xs text-muted-foreground">{t('Com uma conta, você revisa com ela em qualquer aparelho, sem informar o nome.')}</p>
        </div>
      </form>
    </div>
  );
}

/**
 * Entrada pelo link de revisão: sessão de visitante e nome, ou a conta já
 * aberta (sem pedir nome), e a ficha.
 * Pronta, descarta a revisão do cache (uma tentativa sem a ficha pode ter
 * guardado "sem acesso") e mostra a revisão com a identidade do visitante.
 */
export function GuestReviewGate({ projectId, reviewId, snapshotId, token, children }: GuestReviewGateProps) {
  const queryClient = useQueryClient();
  const { t } = useT();
  const { session, register, changeName } = useReviewGuest(projectId, reviewId, snapshotId, token);
  const [readyFor, setReadyFor] = useState<string | null>(null);
  const identity = session.status === 'ready' ? session.identity : null;

  useEffect(() => {
    if (!identity) return;
    queryClient.removeQueries({ queryKey: reviewKey(projectId, reviewId) });
    setReadyFor(identity.key);
  }, [identity, queryClient, projectId, reviewId]);

  if (session.status === 'error') return <FullPageStatus title={t('Não foi possível abrir a revisão')} description={session.message} />;
  if (session.status === 'need-name' || (session.status === 'saving' && !identity)) {
    return (
      <GuestNameForm
        suggestion={session.status === 'need-name' ? session.suggestion : ''}
        isSaving={session.status === 'saving'}
        onSubmit={(name) => void register(name)}
      />
    );
  }
  if (!identity || readyFor !== identity.key) return <FullPageStatus title={t('Abrindo a revisão')} loading />;
  return <>{children(identity, changeName)}</>;
}
