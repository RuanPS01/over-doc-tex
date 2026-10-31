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
  const { signInWithGoogle, signInWithEmail, signUpWithEmail, status } = useAuth();
  const [, navigate] = useLocation();
  const next = safeNext(useSearch());
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
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

  const isDemo = status === 'demo';
  const isSignUp = mode === 'sign-up';

  return (
    <div className="flex min-h-viewport items-center justify-center px-4">
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-xl border bg-card p-6 shadow-sm">
        <h1 className="text-lg font-semibold">{isSignUp ? 'Criar conta no OverDocTeX' : 'Entrar no OverDocTeX'}</h1>
        {isDemo && (
          <p className="text-sm text-muted-foreground">Firebase não configurado: login indisponível no modo demonstração.</p>
        )}
        <Button variant="outline" disabled={isDemo || isBusy} onClick={() => void run(signInWithGoogle)}>
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
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
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
