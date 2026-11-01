import { useEffect, useState } from 'react';
import { Link, useParams } from 'wouter';
import { FullPageStatus } from '@/components/common/full-page-status';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AiSettingsDialog } from '@/features/ai-assistant/components/ai-settings-dialog';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { ChangesDialog } from '@/features/diff/components/changes-dialog';
import { EditorShell } from '@/features/editor/components/editor-shell';
import { useProjectFiles } from '@/features/editor/hooks/use-project-files';
import { EditorStoreProvider, useEditorStore } from '@/features/editor/state/editor-store';
import { ProjectSettingsDialog } from '@/features/projects/components/project-settings-dialog';
import { roleOf, useProject, type ProjectInfo } from '@/features/projects/hooks/use-project';
import { useProjectDocuments, withMainDocument } from '@/features/projects/hooks/use-project-documents';
import { useProjectMembers } from '@/features/projects/hooks/use-project-members';
import { MAIN_FILE_ID } from '@/features/projects/model/new-project';
import { ProjectReviewQueue } from '@/features/review/components/project-review-queue';
import { RequestReviewDialog } from '@/features/review/components/request-review-dialog';
import { VersionHistorySheet } from '@/features/snapshots/components/version-history-sheet';
import { useT } from '@/hooks/use-t';
import { msg } from '@/lib/i18n';
import { hasDocumentClass, type TexIssue } from '@/lib/latex/prepare';

const INVITE_DESCRIPTIONS = {
  editor: msg('Você foi convidado para editar este projeto com o e-mail {email}.'),
  viewer: msg('Você foi convidado para ler este projeto com o e-mail {email}.'),
} as const;

/**
 * Diálogos do cabeçalho do editor (versões, alterações, revisão e
 * configurações). Ficam na página porque juntam várias features.
 */
function EditorDialogs({ project, currentUid }: { project: ProjectInfo; currentUid: string | null }) {
  const { t } = useT();
  const { projectId, projectName, role, canEdit, dialog, openDialog, closeDialog, openFile, revealLine } = useEditorStore();
  const { data: files = [] } = useProjectFiles(projectId);
  const { status } = useAuth();
  const { data: documents = [] } = useProjectDocuments(projectId, status !== 'demo');
  const rootCandidates = files
    .filter((file) => file.kind === 'tex' && file.content !== null && hasDocumentClass(file.content))
    .map((file) => ({ id: file.id, path: file.path }));
  const setOpen = (open: boolean) => !open && closeDialog();
  const fileIdOf = (path: string | null) => files.find((file) => file.path === path)?.id;
  const handleIssue = (issue: TexIssue) => {
    const fileId = fileIdOf(issue.file);
    if (fileId) revealLine(fileId, issue.line ?? 1);
  };

  // A IA usa a chave de quem está usando (na conta ou neste navegador): funciona até no modo demonstração.
  const aiSettings = <AiSettingsDialog open={dialog?.kind === 'ai-settings'} onOpenChange={setOpen} />;

  // Modo demonstração: nada é salvo, então versões, revisões e membros não existem.
  if (status === 'demo') {
    return (
      <>
      {aiSettings}
      <Dialog open={dialog !== null && dialog.kind !== 'ai-settings'} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('Disponível com o Firebase configurado')}</DialogTitle>
            <DialogDescription>
              {t(
                'Versões, revisões, comparação de alterações e membros ficam salvos no Firestore. No modo demonstração, configure o Firebase no arquivo .env para usar estas funções.',
              )}
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
      </>
    );
  }

  const isHistoryOpen = dialog?.kind === 'history';
  return (
    <>
      {aiSettings}
      <VersionHistorySheet
        open={isHistoryOpen}
        onOpenChange={setOpen}
        projectId={projectId}
        projectName={projectName}
        canEdit={canEdit}
        currentUid={currentUid}
        memberProfiles={project.memberProfiles}
        onCompare={(snapshotId) => openDialog({ kind: 'changes', baseSnapshotId: snapshotId })}
        onIssueSelect={handleIssue}
        reviewsTab={<ProjectReviewQueue projectId={projectId} enabled={isHistoryOpen} />}
      />
      <ChangesDialog
        open={dialog?.kind === 'changes'}
        onOpenChange={setOpen}
        projectId={projectId}
        initialBaseId={dialog?.kind === 'changes' ? dialog.baseSnapshotId : null}
        onOpenFile={(path) => {
          const fileId = fileIdOf(path);
          if (!fileId) return;
          closeDialog();
          openFile(fileId);
        }}
        onOpenHistory={() => openDialog({ kind: 'history' })}
        canEdit={canEdit}
      />
      {canEdit && (
        <RequestReviewDialog
          open={dialog?.kind === 'request-review'}
          onOpenChange={setOpen}
          projectId={projectId}
          projectName={projectName}
          documents={withMainDocument(documents, projectName)}
          onIssueSelect={handleIssue}
        />
      )}
      <ProjectSettingsDialog
        open={dialog?.kind === 'settings'}
        onOpenChange={setOpen}
        project={project}
        currentUid={currentUid}
        role={role}
        rootCandidates={rootCandidates}
      />
    </>
  );
}

/**
 * Rota /p/:projectId. Páginas apenas compõem features: nenhuma chamada ao
 * Firebase acontece aqui.
 */
export default function EditorPage() {
  const { t } = useT();
  const { projectId = 'demo' } = useParams<{ projectId: string }>();
  const { status, user } = useAuth();
  const { data: project, isPending, isError, refetch } = useProject(projectId);
  const members = useProjectMembers(projectId);
  const [isAccepting, setIsAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const isDemo = status === 'demo';
  const role = project ? (isDemo ? 'owner' : roleOf(project, user?.uid)) : null;
  const email = user?.email?.toLowerCase() ?? '';
  const invitedRole = project && !role && user?.emailVerified ? (project.pendingMembers[email] ?? null) : null;

  // Projetos antigos não têm o nome do membro na lista: ele mesmo grava ao abrir.
  const saveOwnProfile = members.saveOwnProfile;
  const hasProfile = Boolean(project && user && project.memberProfiles[user.uid]);
  useEffect(() => {
    if (!isDemo && role && !hasProfile) void saveOwnProfile().catch(() => undefined);
  }, [isDemo, role, hasProfile, saveOwnProfile]);

  const backToProjects = (
    <Button asChild variant="outline" size="sm">
      <Link href="/">{t('Voltar aos projetos')}</Link>
    </Button>
  );

  if (isPending) return <FullPageStatus title={t('Abrindo o projeto')} loading />;
  if (isError) {
    return (
      <FullPageStatus
        title={t('Não foi possível abrir o projeto')}
        description={t('Confira a conexão e tente de novo.')}
        action={
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void refetch()}>
              {t('Tentar de novo')}
            </Button>
            {backToProjects}
          </div>
        }
      />
    );
  }
  if (project && invitedRole) {
    const accept = async () => {
      setIsAccepting(true);
      setAcceptError(null);
      try {
        await members.acceptInvite(invitedRole);
      } catch {
        setAcceptError(t('Não foi possível aceitar o convite. Ele pode ter sido cancelado.'));
      } finally {
        setIsAccepting(false);
      }
    };
    return (
      <FullPageStatus
        title={t('Convite para {name}', { name: project.name })}
        description={acceptError ?? t(INVITE_DESCRIPTIONS[invitedRole], { email })}
        action={
          <div className="flex gap-2">
            <Button size="sm" disabled={isAccepting} onClick={() => void accept()}>
              {t('Aceitar convite')}
            </Button>
            {backToProjects}
          </div>
        }
      />
    );
  }
  if (!project || !role) {
    return (
      <FullPageStatus
        title={t('Projeto não encontrado')}
        description={
          user && !user.emailVerified
            ? t(
                'Ele não existe ou a sua conta não é membro dele. Se você recebeu um convite, entre com o Google ou com o link de acesso enviado ao e-mail convidado.',
              )
            : t('Ele não existe ou a sua conta não é membro dele. Peça um convite a quem é dono do projeto.')
        }
        action={backToProjects}
      />
    );
  }

  return (
    <EditorStoreProvider key={projectId} projectId={projectId} projectName={project.name} role={role} initialFileId={MAIN_FILE_ID}>
      <EditorShell />
      <EditorDialogs project={project} currentUid={user?.uid ?? null} />
    </EditorStoreProvider>
  );
}
