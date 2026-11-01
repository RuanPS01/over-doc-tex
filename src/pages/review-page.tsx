import { Link, Redirect, useLocation, useParams, useSearch } from 'wouter';
import { FullPageStatus } from '@/components/common/full-page-status';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { roleOf, useProject } from '@/features/projects/hooks/use-project';
import { GuestReviewGate } from '@/features/review/components/guest-review-gate';
import { ReviewWorkspace } from '@/features/review/components/review-workspace';
import { useReview } from '@/features/review/hooks/use-review';
import { useT } from '@/hooks/use-t';

interface ReviewLink {
  token: string;
  snapshotId: string;
}

/** Revisão de quem entrou pelo link (visitante ou conta não convidada), com o nome informado. */
function GuestReview({ projectId, reviewId, link }: { projectId: string; reviewId: string; link: ReviewLink }) {
  return (
    <GuestReviewGate projectId={projectId} reviewId={reviewId} snapshotId={link.snapshotId} token={link.token}>
      {(identity, changeName) => <GuestWorkspace projectId={projectId} reviewId={reviewId} identity={identity} onChangeName={changeName} />}
    </GuestReviewGate>
  );
}

function GuestWorkspace({
  projectId,
  reviewId,
  identity,
  onChangeName,
}: {
  projectId: string;
  reviewId: string;
  identity: { name: string; key: string };
  onChangeName: () => void;
}) {
  const { t } = useT();
  const { data: review, isPending } = useReview(projectId, reviewId);
  if (isPending) return <FullPageStatus title={t('Abrindo a revisão')} loading />;
  if (!review) {
    return (
      <FullPageStatus
        title={t('Não foi possível abrir a revisão')}
        description={t('Este link não vale mais: ele foi trocado ou a revisão passou a exigir login. Peça um link novo a quem enviou.')}
      />
    );
  }
  return <ReviewWorkspace review={review} role="reviewer" guest={identity} onChangeGuestName={onChangeName} />;
}

/** Revisão de quem tem conta: membro do projeto (autor) ou e-mail convidado (revisor). */
function AccountReview({ projectId, reviewId, link }: { projectId: string; reviewId: string; link: ReviewLink | null }) {
  const { user, signOut } = useAuth();
  const { t } = useT();
  const [location] = useLocation();
  const { data: review, isPending } = useReview(projectId, reviewId);
  const { data: project, isPending: isProjectPending } = useProject(projectId);

  if (isPending || isProjectPending) return <FullPageStatus title={t('Abrindo a revisão')} loading />;

  if (!review) {
    // Conta sem convite, mas com o link da revisão: entra como revisor pelo link, com nome.
    if (link) return <GuestReview projectId={projectId} reviewId={reviewId} link={link} />;
    const switchAccount = async () => {
      await signOut();
      window.location.assign(`${import.meta.env.BASE_URL}login?next=${encodeURIComponent(location)}`);
    };
    return (
      <FullPageStatus
        title={t('Revisão não encontrada')}
        description={
          user?.emailVerified
            ? t('Ela não existe ou não foi pedida para {email}. Entre com o e-mail que recebeu o convite.', { email: user.email ?? '' })
            : t('Para ver a revisão, entre com o Google ou com o link de acesso enviado ao e-mail convidado (contas de e-mail e senha não confirmam o endereço).')
        }
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button size="sm" onClick={() => void switchAccount()}>
              {t('Entrar com outra conta')}
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/">{t('Voltar aos projetos')}</Link>
            </Button>
          </div>
        }
      />
    );
  }

  const role = project ? roleOf(project, user?.uid) : null;
  return <ReviewWorkspace review={review} role={role ? 'author' : 'reviewer'} canManage={role === 'owner' || role === 'editor'} />;
}

/**
 * Rota /p/:projectId/reviews/:reviewId: PDF da versão congelada com os
 * comentários. Membros entram como autores; e-mails convidados, como
 * revisores. Com ?k=código&v=versão (revisão aberta pelo link), quem não tem
 * conta entra como visitante, informando o nome.
 */
export default function ReviewPage() {
  const { projectId = '', reviewId = '' } = useParams<{ projectId: string; reviewId: string }>();
  const search = useSearch();
  const [location] = useLocation();
  const { status } = useAuth();
  const { t } = useT();
  const params = new URLSearchParams(search);
  const token = params.get('k');
  const snapshotId = params.get('v');
  const link = token && snapshotId ? { token, snapshotId } : null;

  if (status === 'demo') {
    return (
      <FullPageStatus
        title={t('Revisões precisam do Firebase')}
        description={t('No modo demonstração não há versões nem revisões salvas.')}
        action={
          <Button asChild variant="outline" size="sm">
            <Link href="/">{t('Voltar aos projetos')}</Link>
          </Button>
        }
      />
    );
  }
  if (status === 'loading') return <FullPageStatus title={t('Abrindo sua sessão')} loading />;
  if (status === 'signed-out' || status === 'guest') {
    if (link) return <GuestReview projectId={projectId} reviewId={reviewId} link={link} />;
    const next = `${location}${search ? `?${search}` : ''}`;
    return <Redirect to={`/login?next=${encodeURIComponent(next)}`} />;
  }
  return <AccountReview projectId={projectId} reviewId={reviewId} link={link} />;
}
