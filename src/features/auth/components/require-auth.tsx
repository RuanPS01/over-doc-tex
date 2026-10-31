import type { ReactNode } from 'react';
import { Redirect, useLocation } from 'wouter';
import { FullPageStatus } from '@/components/common/full-page-status';
import { useAuth } from '../hooks/use-auth';

/**
 * Telas de trabalho exigem login quando o Firebase está configurado. Sem
 * sessão, vai para /login e volta para a mesma tela depois de entrar.
 * No modo demonstração, passa direto.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const [location] = useLocation();

  if (status === 'loading') return <FullPageStatus title="Abrindo sua sessão" loading />;
  if (status === 'signed-out') return <Redirect to={`/login?next=${encodeURIComponent(location)}`} />;
  return <>{children}</>;
}
