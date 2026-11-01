import { LogOut, Plus } from 'lucide-react';
import { useState } from 'react';
import { ThemeMenu } from '@/components/common/theme-menu';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { NotificationBell } from '@/features/notifications/components/notification-bell';
import { NewProjectDialog } from '@/features/projects/components/new-project-dialog';
import { DemoProjectList, ProjectList } from '@/features/projects/components/project-list';
import { MyReviewsSection } from '@/features/review/components/my-reviews-section';

/** Rota /. Projetos do usuário (no modo demonstração, um projeto de exemplo). */
export default function ProjectsPage() {
  const { status, user, signOut } = useAuth();
  const [creating, setCreating] = useState(false);
  const isDemo = status === 'demo';

  return (
    <div className="mx-auto flex min-h-viewport w-full max-w-4xl flex-col gap-6 px-4 py-6">
      <header className="flex items-center gap-2">
        <h1 className="min-w-0 flex-1 truncate text-xl font-semibold">Meus projetos</h1>
        <Button size="sm" disabled={isDemo} title={isDemo ? 'Configure o Firebase para criar projetos' : undefined} onClick={() => setCreating(true)}>
          <Plus />
          <span className="hidden xs:inline">Novo projeto</span>
        </Button>
        <ThemeMenu />
        {user && <NotificationBell />}
        {user && (
          <Button size="sm" variant="ghost" aria-label="Sair da conta" title={user.email ?? undefined} onClick={() => void signOut()}>
            <LogOut />
            <span className="hidden sm:inline">Sair</span>
          </Button>
        )}
      </header>

      {isDemo ? (
        <>
          <p className="rounded-md border border-warning/50 bg-warning/10 p-3 text-sm">
            Modo demonstração: configure o Firebase no arquivo .env para salvar projetos.
          </p>
          <DemoProjectList />
        </>
      ) : (
        <>
          <ProjectList onCreate={() => setCreating(true)} />
          <MyReviewsSection />
        </>
      )}

      <NewProjectDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}
