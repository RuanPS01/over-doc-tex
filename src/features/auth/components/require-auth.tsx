import type { ReactNode } from 'react';
import { Redirect, useLocation } from 'wouter';
import { FullPageStatus } from '@/components/common/full-page-status';
import { useT } from '@/hooks/use-t';
import { useAuth } from '../hooks/use-auth';

/**
 * Telas de trabalho exigem login quando o Firebase está configurado. Sem
 * sessão, vai para /login e volta para a mesma tela depois de entrar.
 * No modo demonstração, passa direto.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { t } = useT();
  const { status } = useAuth();
  const [location] = useLocation();

  if (status === 'loading') return <FullPageStatus title={t('Abrindo sua sessão')} loading />;
  // A sessão anônima de um link de revisão não abre as telas de trabalho.
  if (status === 'signed-out' || status === 'guest') return <Redirect to={`/login?next=${encodeURIComponent(location)}`} />;
  return <>{children}</>;
}
