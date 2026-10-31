import { FileText } from 'lucide-react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { useProjects, type ProjectSummary } from '../hooks/use-projects';

const ROLE_LABELS: Record<ProjectSummary['role'], string> = {
  owner: 'Dono',
  editor: 'Editor',
  viewer: 'Leitor',
};

const dateFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

function ProjectCard({ href, title, subtitle }: { href: string; title: string; subtitle: string }) {
  return (
    <li>
      <Link
        href={href}
        className="flex min-w-0 items-center gap-3 rounded-lg border bg-card p-4 transition-colors hover:bg-accent"
      >
        <FileText className="size-5 shrink-0 text-primary" />
        <span className="min-w-0">
          <span className="block truncate font-medium">{title}</span>
          <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
        </span>
      </Link>
    </li>
  );
}

/** Projeto de exemplo do modo demonstração (sem Firebase). */
export function DemoProjectList() {
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <ProjectCard href="/p/demo" title="Revisão Colaborativa de Documentos LaTeX" subtitle="Projeto de exemplo" />
    </ul>
  );
}

/** Projetos de que o usuário é membro, mais recentes primeiro. */
export function ProjectList({ onCreate }: { onCreate: () => void }) {
  const { data: projects, isPending, isError, error, refetch } = useProjects();

  if (isPending) {
    return (
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2" aria-busy="true" aria-label="Carregando projetos">
        {[0, 1].map((key) => (
          <li key={key} className="h-[74px] animate-pulse rounded-lg border bg-muted/40" />
        ))}
      </ul>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm" role="alert">
        <p className="font-medium">Não foi possível carregar seus projetos.</p>
        <p className="text-muted-foreground">{error.message}</p>
        <Button size="sm" variant="outline" onClick={() => void refetch()}>
          Tentar de novo
        </Button>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-6 text-sm">
        <p className="font-medium">Você ainda não tem projetos.</p>
        <p className="text-muted-foreground">Crie um projeto em branco ou, dentro dele, importe um .zip com o seu documento LaTeX.</p>
        <Button size="sm" onClick={onCreate}>
          Criar o primeiro projeto
        </Button>
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {projects.map((project) => (
        <ProjectCard
          key={project.id}
          href={`/p/${project.id}`}
          title={project.name}
          subtitle={[ROLE_LABELS[project.role], project.updatedAt && `atualizado em ${dateFormat.format(project.updatedAt)}`]
            .filter(Boolean)
            .join(', ')}
        />
      ))}
    </ul>
  );
}
