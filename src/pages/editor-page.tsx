import { Link, useParams } from 'wouter';
import { FullPageStatus } from '@/components/common/full-page-status';
import { Button } from '@/components/ui/button';
import { EditorShell } from '@/features/editor/components/editor-shell';
import { EditorStoreProvider } from '@/features/editor/state/editor-store';
import { useProject } from '@/features/projects/hooks/use-project';
import { MAIN_FILE_ID } from '@/features/projects/model/new-project';

/**
 * Rota /p/:projectId. Páginas apenas compõem features: nenhuma chamada ao
 * Firebase acontece aqui.
 */
export default function EditorPage() {
  const { projectId = 'demo' } = useParams<{ projectId: string }>();
  const { data: project, isPending, isError, refetch } = useProject(projectId);

  const backToProjects = (
    <Button asChild variant="outline" size="sm">
      <Link href="/">Voltar aos projetos</Link>
    </Button>
  );

  if (isPending) return <FullPageStatus title="Abrindo o projeto" loading />;
  if (isError) {
    return (
      <FullPageStatus
        title="Não foi possível abrir o projeto"
        description="Confira a conexão e tente de novo."
        action={
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void refetch()}>
              Tentar de novo
            </Button>
            {backToProjects}
          </div>
        }
      />
    );
  }
  if (!project) {
    return (
      <FullPageStatus
        title="Projeto não encontrado"
        description="Ele não existe ou a sua conta não é membro dele. Peça um convite a quem é dono do projeto."
        action={backToProjects}
      />
    );
  }

  return (
    <EditorStoreProvider key={projectId} projectId={projectId} projectName={project.name} initialFileId={MAIN_FILE_ID}>
      <EditorShell />
    </EditorStoreProvider>
  );
}
