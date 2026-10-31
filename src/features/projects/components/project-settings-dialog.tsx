import { Check, Copy, Loader2, Trash2, UserPlus } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { ProjectRole } from '@shared/firestore/types';
import { normalizeEmail } from '@/lib/email';
import type { ProjectInfo } from '../hooks/use-project';
import { useProjectMembers, type InviteRole } from '../hooks/use-project-members';
import { MAX_PROJECT_NAME, normalizeProjectName } from '../model/new-project';
import { ProjectDocumentsSection } from './project-documents-section';

const ROLE_LABELS: Record<ProjectRole, string> = { owner: 'Dono', editor: 'Edita', viewer: 'Só lê' };

interface ProjectSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: ProjectInfo;
  currentUid: string | null;
  role: ProjectRole;
  rootCandidates: ReadonlyArray<{ id: string; path: string }>;
}

/** Nome, descrição, membros e convites de coautoria (o dono gerencia; quem edita muda os detalhes). */
export function ProjectSettingsDialog({ open, onOpenChange, project, currentUid, role, rootCandidates }: ProjectSettingsDialogProps) {
  const members = useProjectMembers(project.id);
  const canEdit = role === 'owner' || role === 'editor';
  const isOwner = role === 'owner';
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? '');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<InviteRole>('editor');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const projectLink = new URL(`${import.meta.env.BASE_URL}p/${project.id}`, window.location.origin).href;

  useEffect(() => {
    if (!open) return;
    setName(project.name);
    setDescription(project.description ?? '');
    setMessage(null);
    setCopied(false);
  }, [open, project.name, project.description]);

  const run = async (key: string, action: () => Promise<unknown>, success: string) => {
    setBusy(key);
    setMessage(null);
    try {
      await action();
      setMessage({ text: success, isError: false });
    } catch {
      setMessage({ text: 'Não foi possível salvar. Confira a conexão e a sua permissão no projeto.', isError: true });
    } finally {
      setBusy(null);
    }
  };

  const handleDetails = (event: FormEvent) => {
    event.preventDefault();
    const normalized = normalizeProjectName(name);
    if (!normalized) {
      setMessage({ text: 'O nome não pode ficar vazio.', isError: true });
      return;
    }
    void run('details', () => members.saveDetails({ name: normalized, description: description.trim() || null }), 'Detalhes salvos.');
  };

  const handleInvite = (event: FormEvent) => {
    event.preventDefault();
    const email = normalizeEmail(inviteEmail);
    if (!email) {
      setMessage({ text: 'Informe um e-mail válido.', isError: true });
      return;
    }
    if (Object.values(project.memberProfiles).some((profile) => profile.email === email)) {
      setMessage({ text: 'Esta pessoa já é membro do projeto.', isError: true });
      return;
    }
    void run(
      'invite',
      async () => {
        await members.invite(email, inviteRole);
        setInviteEmail('');
      },
      `Convite registrado. Envie o link do projeto para ${email}: ao entrar com esse e-mail, a pessoa aceita o convite.`,
    );
  };

  const memberIds = Object.keys(project.members).sort((a, b) =>
    project.members[a] === 'owner' ? -1 : project.members[b] === 'owner' ? 1 : (project.memberProfiles[a]?.name ?? a).localeCompare(project.memberProfiles[b]?.name ?? b),
  );
  const pending = Object.entries(project.pendingMembers);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configurações do projeto</DialogTitle>
          <DialogDescription>{isOwner ? 'Você é dono deste projeto.' : `Seu papel: ${ROLE_LABELS[role].toLowerCase()}.`}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleDetails} className="flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Nome
            <Input value={name} maxLength={MAX_PROJECT_NAME} disabled={!canEdit} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Descrição
            <Textarea
              value={description}
              rows={2}
              maxLength={1000}
              disabled={!canEdit}
              placeholder="Sobre o que é o documento (opcional)"
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          {canEdit && (
            <Button type="submit" size="sm" className="self-end" disabled={busy !== null}>
              {busy === 'details' && <Loader2 className="animate-spin" />}
              Salvar detalhes
            </Button>
          )}
        </form>

        <ProjectDocumentsSection projectId={project.id} projectName={project.name} canEdit={canEdit} rootCandidates={rootCandidates} />

        <section className="flex flex-col gap-2 border-t pt-4">
          <h3 className="text-sm font-semibold">Membros</h3>
          <ul className="flex flex-col gap-1">
            {memberIds.map((uid) => {
              const memberRole = project.members[uid]!;
              const profile = project.memberProfiles[uid];
              const canManage = isOwner && memberRole !== 'owner';
              return (
                <li key={uid} className="flex min-w-0 items-center gap-2 rounded-md border px-2 py-1.5">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm">
                      {profile?.name ?? 'Membro'}
                      {uid === currentUid ? ' (você)' : ''}
                    </span>
                    {profile?.email && <span className="truncate text-xs text-muted-foreground">{profile.email}</span>}
                  </span>
                  {canManage ? (
                    <>
                      <Select
                        value={memberRole}
                        disabled={busy !== null}
                        onValueChange={(value) => void run(uid, () => members.changeRole(uid, value as InviteRole), 'Papel atualizado.')}
                      >
                        <SelectTrigger className="h-8 w-24 shrink-0 text-xs" aria-label={`Papel de ${profile?.name ?? 'membro'}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="editor">{ROLE_LABELS.editor}</SelectItem>
                          <SelectItem value="viewer">{ROLE_LABELS.viewer}</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 shrink-0"
                        aria-label={`Remover ${profile?.name ?? 'membro'}`}
                        disabled={busy !== null}
                        onClick={() => void run(uid, () => members.removeMember(uid), 'Membro removido.')}
                      >
                        <Trash2 />
                      </Button>
                    </>
                  ) : (
                    <span className="shrink-0 text-xs text-muted-foreground">{ROLE_LABELS[memberRole]}</span>
                  )}
                </li>
              );
            })}
            {pending.map(([email, pendingRole]) => (
              <li key={email} className="flex min-w-0 items-center gap-2 rounded-md border border-dashed px-2 py-1.5">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm">{email}</span>
                  <span className="text-xs text-muted-foreground">Convite pendente: {ROLE_LABELS[pendingRole].toLowerCase()}</span>
                </span>
                {isOwner && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0"
                    aria-label={`Cancelar o convite de ${email}`}
                    disabled={busy !== null}
                    onClick={() => void run(email, () => members.cancelInvite(email), 'Convite cancelado.')}
                  >
                    <Trash2 />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>

        {isOwner && (
          <form onSubmit={handleInvite} className="flex flex-col gap-2 border-t pt-4">
            <h3 className="text-sm font-semibold">Convidar coautor</h3>
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
              <Input
                type="email"
                required
                value={inviteEmail}
                placeholder="coautor@universidade.br"
                aria-label="E-mail do coautor"
                className="min-w-0 sm:flex-1"
                onChange={(event) => setInviteEmail(event.target.value)}
              />
              <Select value={inviteRole} onValueChange={(value) => setInviteRole(value as InviteRole)}>
                <SelectTrigger className="sm:w-28" aria-label="Papel do convidado">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="editor">{ROLE_LABELS.editor}</SelectItem>
                  <SelectItem value="viewer">{ROLE_LABELS.viewer}</SelectItem>
                </SelectContent>
              </Select>
              <Button type="submit" disabled={busy !== null}>
                {busy === 'invite' ? <Loader2 className="animate-spin" /> : <UserPlus />}
                Convidar
              </Button>
            </div>
            <div className="flex min-w-0 gap-2">
              <Input readOnly value={projectLink} aria-label="Link do projeto" className="min-w-0 flex-1 font-mono text-xs" />
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Copiar link do projeto"
                onClick={() => void navigator.clipboard.writeText(projectLink).then(() => setCopied(true))}
              >
                {copied ? <Check /> : <Copy />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              O convidado abre este link e entra com o e-mail convidado (Google ou link de acesso, que confirmam o endereço).
            </p>
          </form>
        )}

        {message && (
          <p role={message.isError ? 'alert' : 'status'} className={message.isError ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>
            {message.text}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
