import { KeyRound, Loader2, Mail, Save } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useT } from '@/hooks/use-t';
import { msg } from '@/lib/i18n';
import { useAuth } from '../hooks/use-auth';
import { cleanDisplayName, useProfile } from '../hooks/use-profile';

/** Mensagens são chaves de tradução (msg): quem mostra chama t(). */
const PROFILE_ERRORS: Record<string, string> = {
  'auth/invalid-credential': msg('A senha atual não confere.'),
  'auth/wrong-password': msg('A senha atual não confere.'),
  'auth/weak-password': msg('A senha precisa de pelo menos 6 caracteres.'),
  'auth/too-many-requests': msg('Muitas tentativas. Espere alguns minutos e tente de novo.'),
  'auth/requires-recent-login': msg('Por segurança, saia e entre de novo antes de trocar a senha.'),
  'auth/network-request-failed': msg('Sem conexão. Confira a internet e tente de novo.'),
};

/** Chave da mensagem de erro (traduzir com t()); erros do app já vêm traduzidos. */
function errorKey(error: unknown): string {
  const code = (error as { code?: string }).code ?? '';
  if (PROFILE_ERRORS[code]) return PROFILE_ERRORS[code];
  if (!code && error instanceof Error && error.message) return error.message;
  return msg('Não foi possível salvar. Confira a conexão e tente de novo.');
}

type Busy = 'name' | 'password' | 'link' | null;

/**
 * "Perfil" (menu da conta na tela de projetos): o nome que coautores e
 * revisores veem e a senha. Quem tem senha troca com a atual; quem entra só
 * com Google ou link de acesso recebe um link para criar uma.
 */
export function ProfileDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useT();
  const { user } = useAuth();
  const profile = useProfile();
  const [name, setName] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [busy, setBusy] = useState<Busy>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasPassword = user?.providers.includes('password') ?? false;

  // Cada abertura parte do nome atual da conta, sem mensagens antigas.
  useEffect(() => {
    if (!open) return;
    setName(user?.displayName ?? '');
    setCurrentPassword('');
    setNextPassword('');
    setNotice(null);
    setError(null);
    // Só ao abrir (sem user nas dependências): o nome salvo não apaga o que está sendo digitado.
  }, [open]);

  const run = async (kind: NonNullable<Busy>, action: () => Promise<string>) => {
    setBusy(kind);
    setNotice(null);
    setError(null);
    try {
      setNotice(await action());
    } catch (caught) {
      setError(t(errorKey(caught)));
    } finally {
      setBusy(null);
    }
  };

  const saveName = (event: FormEvent) => {
    event.preventDefault();
    void run('name', async () => {
      const projects = await profile.saveName(name);
      if (projects === 0) return t('Nome salvo.');
      return projects === 1 ? t('Nome salvo e atualizado em 1 projeto.') : t('Nome salvo e atualizado em {count} projetos.', { count: projects });
    });
  };

  const changePassword = (event: FormEvent) => {
    event.preventDefault();
    void run('password', async () => {
      await profile.changePassword(currentPassword, nextPassword);
      setCurrentPassword('');
      setNextPassword('');
      return t('Senha trocada. Use a nova senha na próxima vez que entrar.');
    });
  };

  const sendLink = () =>
    void run('link', async () => {
      const email = await profile.sendPasswordLink();
      return t('Enviamos para {email} um link para criar uma senha nova. Confira também a caixa de spam.', { email });
    });

  const nameChanged = cleanDisplayName(name) !== (user?.displayName ?? '') && cleanDisplayName(name).length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('Perfil')}</DialogTitle>
          <DialogDescription>{t('O nome aparece para coautores e revisores. E-mail da conta: {email}.', { email: user?.email ?? '-' })}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5 text-sm">
          <form onSubmit={saveName} className="flex flex-col gap-2">
            <label htmlFor="profile-name" className="font-medium">
              {t('Nome')}
            </label>
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
              <Input
                id="profile-name"
                value={name}
                maxLength={80}
                autoComplete="name"
                disabled={busy !== null}
                onChange={(event) => setName(event.target.value)}
                className="min-w-0 flex-1"
              />
              <Button type="submit" disabled={busy !== null || !nameChanged}>
                {busy === 'name' ? <Loader2 className="animate-spin" /> : <Save />}
                {t('Salvar nome')}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t('Comentários já feitos continuam com o nome da época.')}</p>
          </form>

          <section className="flex flex-col gap-2">
            <h3 className="font-medium">{t('Senha')}</h3>
            {hasPassword ? (
              <form onSubmit={changePassword} className="flex flex-col gap-2">
                {/* Campo de e-mail oculto: ajuda o gerenciador de senhas a saber de qual conta é a senha. */}
                <input type="email" autoComplete="username" value={user?.email ?? ''} readOnly hidden />
                <Input
                  type="password"
                  required
                  autoComplete="current-password"
                  placeholder={t('Senha atual')}
                  aria-label={t('Senha atual')}
                  value={currentPassword}
                  disabled={busy !== null}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                />
                <Input
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  placeholder={t('Nova senha (mínimo de 6 caracteres)')}
                  aria-label={t('Nova senha (mínimo de 6 caracteres)')}
                  value={nextPassword}
                  disabled={busy !== null}
                  onChange={(event) => setNextPassword(event.target.value)}
                />
                <Button type="submit" className="self-start" disabled={busy !== null || !currentPassword || nextPassword.length < 6}>
                  {busy === 'password' ? <Loader2 className="animate-spin" /> : <KeyRound />}
                  {t('Trocar senha')}
                </Button>
              </form>
            ) : (
              <p className="text-muted-foreground">{t('Você entra com o Google ou com o link de acesso. Para entrar também com e-mail e senha, crie uma senha pelo link enviado ao seu e-mail.')}</p>
            )}
            <Button type="button" variant={hasPassword ? 'link' : 'outline'} className={hasPassword ? 'h-auto self-start p-0 text-xs' : 'self-start'} disabled={busy !== null} onClick={sendLink}>
              {busy === 'link' ? <Loader2 className="animate-spin" /> : <Mail />}
              {hasPassword ? t('Esqueci a senha atual: receber link por e-mail') : t('Receber link para criar senha')}
            </Button>
          </section>

          {notice && (
            <p role="status" className="rounded-md bg-success/15 p-2 text-success">
              {notice}
            </p>
          )}
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
