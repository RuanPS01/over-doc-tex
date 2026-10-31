import { Mail } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useSearch } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/features/auth/hooks/use-auth';

const AUTH_ERRORS: Record<string, string> = {
  'auth/invalid-credential': 'E-mail ou senha incorretos.',
  'auth/invalid-email': 'E-mail inválido.',
  'auth/user-disabled': 'Esta conta foi desativada.',
  'auth/email-already-in-use': 'Já existe uma conta com este e-mail. Entre com a senha dela.',
  'auth/weak-password': 'A senha precisa de pelo menos 6 caracteres.',
  'auth/too-many-requests': 'Muitas tentativas. Espere alguns minutos e tente de novo.',
  'auth/popup-closed-by-user': 'A janela do Google foi fechada antes de terminar.',
  'auth/unauthorized-domain':
    'Este endereço não está autorizado no Firebase Authentication. Adicione o domínio em Authentication > Settings > Authorized domains.',
  'auth/operation-not-allowed': 'Este método de login não está ativado no Firebase Authentication.',
  'auth/invalid-action-code': 'O link de acesso expirou ou já foi usado. Peça um novo.',
  'auth/expired-action-code': 'O link de acesso expirou. Peça um novo.',
};

function messageFor(error: unknown): string {
  const code = (error as { code?: string }).code ?? '';
  return AUTH_ERRORS[code] ?? 'Não foi possível entrar. Confira os dados e tente novamente.';
}

/** Só aceita caminhos internos, para o ?next= não virar redirecionamento para fora. */
function safeNext(search: string): string {
  const next = new URLSearchParams(search).get('next');
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

/** Rota /login: Google ou e-mail e senha (Firebase Authentication). */
export default function LoginPage() {
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
      setError(messageFor(caught));
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
      setError('Informe o e-mail para receber o link de acesso.');
      return;
    }
    setIsBusy(true);
    try {
      await sendEmailLink(email.trim().toLowerCase(), next);
      setNotice(`Enviamos um link de acesso para ${email.trim()}. Abra o e-mail e toque no link para entrar.`);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setIsBusy(false);
    }
  };

  const isDemo = status === 'demo';
  const isSignUp = mode === 'sign-up';

  if (isCompletingLink) {
    return (
      <div className="flex min-h-viewport items-center justify-center px-4">
        <form
          className="flex w-full max-w-sm flex-col gap-4 rounded-xl border bg-card p-6 shadow-sm"
          onSubmit={(event) => {
            event.preventDefault();
            void run(() => completeEmailLink(email.trim().toLowerCase()));
          }}
        >
          <h1 className="text-lg font-semibold">Entrar com o link de acesso</h1>
          <p className="text-sm text-muted-foreground">Confirme o e-mail que recebeu o link.</p>
          <Input type="email" required autoComplete="email" placeholder="E-mail" value={email} onChange={(event) => setEmail(event.target.value)} />
          <Button type="submit" disabled={isBusy}>
            Entrar
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
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-xl border bg-card p-6 shadow-sm">
        <h1 className="text-lg font-semibold">{isSignUp ? 'Criar conta no OverDocTeX' : 'Entrar no OverDocTeX'}</h1>
        {isDemo && (
          <p className="text-sm text-muted-foreground">Firebase não configurado: login indisponível no modo demonstração.</p>
        )}
        {/* Diretrizes do Google: "G" nas cores oficiais, a 10px do texto. */}
        <Button variant="outline" className="gap-2.5" disabled={isDemo || isBusy} onClick={() => void run(signInWithGoogle)}>
          <img src={`${import.meta.env.BASE_URL}icons/google-g.svg`} alt="" width={18} height={18} className="size-[18px] shrink-0" />
          Continuar com Google
        </Button>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Input
            type="email"
            required
            autoComplete="email"
            placeholder="E-mail"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <Input
            type="password"
            required
            minLength={isSignUp ? 6 : undefined}
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
            placeholder={isSignUp ? 'Senha (mínimo de 6 caracteres)' : 'Senha'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <Button type="submit" disabled={isDemo || isBusy}>
            {isSignUp ? 'Criar conta' : 'Entrar com e-mail'}
          </Button>
        </form>
        {!isSignUp && (
          <Button variant="outline" disabled={isDemo || isBusy} onClick={() => void handleSendLink()}>
            <Mail />
            Receber link de acesso por e-mail
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
          {isSignUp ? 'Já tenho conta: entrar' : 'Não tem conta? Criar com e-mail'}
        </Button>
      </div>
    </div>
  );
}
