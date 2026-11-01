import { Mail } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useSearch } from 'wouter';
import { PageCornerBar } from '@/components/common/page-corner-bar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { useT } from '@/hooks/use-t';
import { msg } from '@/lib/i18n';

/** Mensagens são chaves de tradução (msg): quem mostra chama t(). */
const AUTH_ERRORS: Record<string, string> = {
  'auth/invalid-credential': msg('E-mail ou senha incorretos.'),
  'auth/invalid-email': msg('E-mail inválido.'),
  'auth/user-disabled': msg('Esta conta foi desativada.'),
  'auth/email-already-in-use': msg('Já existe uma conta com este e-mail. Entre com a senha dela.'),
  'auth/weak-password': msg('A senha precisa de pelo menos 6 caracteres.'),
  'auth/too-many-requests': msg('Muitas tentativas. Espere alguns minutos e tente de novo.'),
  'auth/popup-closed-by-user': msg('A janela do Google foi fechada antes de terminar.'),
  'auth/unauthorized-domain': msg(
    'Este endereço não está autorizado no Firebase Authentication. Adicione o domínio em Authentication > Settings > Authorized domains.',
  ),
  'auth/operation-not-allowed': msg('Este método de login não está ativado no Firebase Authentication.'),
  'auth/invalid-action-code': msg('O link de acesso expirou ou já foi usado. Peça um novo.'),
  'auth/expired-action-code': msg('O link de acesso expirou. Peça um novo.'),
};

/** Chave da mensagem de erro (traduzir com t()). */
function messageFor(error: unknown): string {
  const code = (error as { code?: string }).code ?? '';
  return AUTH_ERRORS[code] ?? msg('Não foi possível entrar. Confira os dados e tente novamente.');
}

/** Só aceita caminhos internos, para o ?next= não virar redirecionamento para fora. */
function safeNext(search: string): string {
  const next = new URLSearchParams(search).get('next');
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

/** Rota /login: Google ou e-mail e senha (Firebase Authentication). */
export default function LoginPage() {
  const { t } = useT();
  const { signInWithGoogle, signInWithEmail, signUpWithEmail, sendEmailLink, isEmailLink, completeEmailLink, status } = useAuth();
  const [, navigate] = useLocation();
  const search = useSearch();
  const next = safeNext(search);
  // Chegou pelo link de acesso enviado por e-mail (convite de revisão ou "Entrar sem senha").
  const [isCompletingLink] = useState(() => isEmailLink());
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [email, setEmail] = useState(() => new URLSearchParams(search).get('email') ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  // Quem já tem sessão não precisa ver o formulário.
  useEffect(() => {
    if (status === 'signed-in') navigate(next, { replace: true });
  }, [status, next, navigate]);

  const run = async (action: () => Promise<void>) => {
    setError(null);
    setIsBusy(true);
    try {
      await action();
      navigate(next, { replace: true });
    } catch (caught) {
      setError(t(messageFor(caught)));
    } finally {
      setIsBusy(false);
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void run(() => (mode === 'sign-up' ? signUpWithEmail(email, password) : signInWithEmail(email, password)));
  };

  const handleSendLink = async () => {
    setError(null);
    setNotice(null);
    if (!email.trim()) {
      setError(t('Informe o e-mail para receber o link de acesso.'));
      return;
    }
    setIsBusy(true);
    try {
      await sendEmailLink(email.trim().toLowerCase(), next);
      setNotice(t('Enviamos um link de acesso para {email}. Abra o e-mail e toque no link para entrar.', { email: email.trim() }));
    } catch (caught) {
      setError(t(messageFor(caught)));
    } finally {
      setIsBusy(false);
    }
  };

  const isDemo = status === 'demo';
  const isSignUp = mode === 'sign-up';

  if (isCompletingLink) {
    return (
      <div className="flex min-h-viewport items-center justify-center px-4">
        <PageCornerBar />
        <form
          className="flex w-full max-w-sm flex-col gap-4 rounded-xl border bg-card p-6 shadow-sm"
          onSubmit={(event) => {
            event.preventDefault();
            void run(() => completeEmailLink(email.trim().toLowerCase()));
          }}
        >
          <h1 className="text-lg font-semibold">{t('Entrar com o link de acesso')}</h1>
          <p className="text-sm text-muted-foreground">{t('Confirme o e-mail que recebeu o link.')}</p>
          <Input type="email" required autoComplete="email" placeholder={t('E-mail')} value={email} onChange={(event) => setEmail(event.target.value)} />
          <Button type="submit" disabled={isBusy}>
            {t('Entrar')}
          </Button>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </form>
      </div>
    );
  }

  return (
    <div className="flex min-h-viewport items-center justify-center px-4">
      <PageCornerBar />
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-xl border bg-card p-6 shadow-sm">
        <h1 className="text-lg font-semibold">{isSignUp ? t('Criar conta no OverDocTeX') : t('Entrar no OverDocTeX')}</h1>
        {isDemo && (
          <p className="text-sm text-muted-foreground">{t('Firebase não configurado: login indisponível no modo demonstração.')}</p>
        )}
        {/* Diretrizes do Google: "G" nas cores oficiais, a 10px do texto. */}
        <Button variant="outline" className="gap-2.5" disabled={isDemo || isBusy} onClick={() => void run(signInWithGoogle)}>
          <img src={`${import.meta.env.BASE_URL}icons/google-g.svg`} alt="" width={18} height={18} className="size-[18px] shrink-0" />
          {t('Continuar com Google')}
        </Button>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Input
            type="email"
            required
            autoComplete="email"
            placeholder={t('E-mail')}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <Input
            type="password"
            required
            minLength={isSignUp ? 6 : undefined}
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
            placeholder={isSignUp ? t('Senha (mínimo de 6 caracteres)') : t('Senha')}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <Button type="submit" disabled={isDemo || isBusy}>
            {isSignUp ? t('Criar conta') : t('Entrar com e-mail')}
          </Button>
        </form>
        {!isSignUp && (
          <Button variant="outline" disabled={isDemo || isBusy} onClick={() => void handleSendLink()}>
            <Mail />
            {t('Receber link de acesso por e-mail')}
          </Button>
        )}
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="text-sm text-muted-foreground" role="status">
            {notice}
          </p>
        )}
        <Button
          variant="link"
          size="sm"
          className="self-center"
          disabled={isDemo || isBusy}
          onClick={() => {
            setMode(isSignUp ? 'sign-in' : 'sign-up');
            setError(null);
          }}
        >
          {isSignUp ? t('Já tenho conta: entrar') : t('Não tem conta? Criar com e-mail')}
        </Button>
      </div>
    </div>
  );
}
