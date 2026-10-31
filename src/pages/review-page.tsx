import { Link, useLocation, useParams } from 'wouter';
import { FullPageStatus } from '@/components/common/full-page-status';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { roleOf, useProject } from '@/features/projects/hooks/use-project';
import { ReviewWorkspace } from '@/features/review/components/review-workspace';
import { useReview } from '@/features/review/hooks/use-review';

/**
 * Rota /p/:projectId/reviews/:reviewId: PDF da versão congelada com os
 * comentários. Membros do projeto entram como autores; quem não é membro
 * entra como revisor, se o e-mail verificado for o convidado.
 */
export default function ReviewPage() {
  const { projectId = '', reviewId = '' } = useParams<{ projectId: string; reviewId: string }>();
  const { status, user, signOut } = useAuth();
  const [location] = useLocation();
  const { data: review, isPending } = useReview(projectId, reviewId);
  const { data: project, isPending: isProjectPending } = useProject(projectId);

  if (status === 'demo') {
    return (
      <FullPageStatus
        title="Revisões precisam do Firebase"
        description="No modo demonstração não há versões nem revisões salvas."
        action={
          <Button asChild variant="outline" size="sm">
            <Link href="/">Voltar aos projetos</Link>
          </Button>
        }
      />
    );
  }
  if (isPending || isProjectPending) return <FullPageStatus title="Abrindo a revisão" loading />;

  if (!review) {
    const switchAccount = async () => {
      await signOut();
      window.location.assign(`${import.meta.env.BASE_URL}login?next=${encodeURIComponent(location)}`);
    };
    return (
      <FullPageStatus
        title="Revisão não encontrada"
        description={
          user?.emailVerified
            ? `Ela não existe ou não foi pedida para ${user.email}. Entre com o e-mail que recebeu o convite.`
            : 'Para ver a revisão, entre com o Google ou com o link de acesso enviado ao e-mail convidado (contas de e-mail e senha não confirmam o endereço).'
        }
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button size="sm" onClick={() => void switchAccount()}>
              Entrar com outra conta
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/">Voltar aos projetos</Link>
            </Button>
          </div>
        }
      />
    );
  }

  const isMember = project ? roleOf(project, user?.uid) !== null : false;
  return <ReviewWorkspace review={review} role={isMember ? 'author' : 'reviewer'} />;
}
