import { Plus, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { LanguageMenu } from '@/components/common/language-menu';
import { ThemeMenu } from '@/components/common/theme-menu';
import { Button } from '@/components/ui/button';
import { AiSettingsDialog } from '@/features/ai-assistant/components/ai-settings-dialog';
import { AccountMenu } from '@/features/auth/components/account-menu';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { NotificationBell } from '@/features/notifications/components/notification-bell';
import { NewProjectDialog } from '@/features/projects/components/new-project-dialog';
import { DemoProjectList, ProjectList } from '@/features/projects/components/project-list';
import { MyReviewsSection } from '@/features/review/components/my-reviews-section';
import { useT } from '@/hooks/use-t';

/** Rota /. Projetos do usuário (no modo demonstração, um projeto de exemplo). */
export default function ProjectsPage() {
  const { t } = useT();
  const { status, user } = useAuth();
  const [creating, setCreating] = useState(false);
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  const isDemo = status === 'demo';

  return (
    <div className="mx-auto flex min-h-viewport w-full max-w-4xl flex-col gap-6 px-4 py-6">
      {/* No celular o título fica numa linha e as ações na seguinte; a partir de sm, tudo numa linha. */}
      <header className="flex flex-wrap items-center gap-x-2 gap-y-3">
        <h1 className="min-w-0 basis-full truncate text-xl font-semibold sm:flex-1 sm:basis-auto">{t('Meus projetos')}</h1>
        <div className="ml-auto flex items-center gap-1">
          <Button size="sm" disabled={isDemo} title={isDemo ? t('Configure o Firebase para criar projetos') : undefined} onClick={() => setCreating(true)}>
            <Plus />
            {t('Novo projeto')}
          </Button>
          <Button variant="ghost" size="icon" className="shrink-0" aria-label={t('Configurações de IA')} title={t('Configurações de IA')} onClick={() => setAiSettingsOpen(true)}>
            <Sparkles />
          </Button>
          <LanguageMenu />
          <ThemeMenu />
          {user && <NotificationBell />}
          <AccountMenu />
        </div>
      </header>

      {isDemo ? (
        <>
          <p className="rounded-md border border-warning/50 bg-warning/10 p-3 text-sm">
            {t('Modo demonstração: configure o Firebase no arquivo .env para salvar projetos.')}
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
      <AiSettingsDialog open={aiSettingsOpen} onOpenChange={setAiSettingsOpen} />
    </div>
  );
}
