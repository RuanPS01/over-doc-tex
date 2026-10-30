import { useState, type FormEvent } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/hooks/use-auth';

/** Rota /login: Google ou e-mail e senha (Firebase Authentication). */
export default function LoginPage() {
  const { signInWithGoogle, signInWithEmail, status } = useAuth();
  const [, navigate] = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<void>) => {
    setError(null);
    try {
      await action();
      navigate('/');
    } catch {
      setError('Não foi possível entrar. Confira os dados e tente novamente.');
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void run(() => signInWithEmail(email, password));
  };

  const inputClass =
    'h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <div className="flex min-h-viewport items-center justify-center px-4">
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-xl border bg-card p-6 shadow-sm">
        <h1 className="text-lg font-semibold">Entrar no OverDocTeX</h1>
        {status === 'demo' && (
          <p className="text-sm text-muted-foreground">Firebase não configurado: login indisponível no modo demonstração.</p>
        )}
        <Button variant="outline" disabled={status === 'demo'} onClick={() => void run(signInWithGoogle)}>
          Continuar com Google
        </Button>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="E-mail"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={inputClass}
          />
          <input
            type="password"
            required
            autoComplete="current-password"
            placeholder="Senha"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={inputClass}
          />
          <Button type="submit" disabled={status === 'demo'}>
            Entrar com e-mail
          </Button>
        </form>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </div>
  );
}
