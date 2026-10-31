import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';

interface FullPageStatusProps {
  title: string;
  description?: string;
  /** Mostra o indicador de carregamento no lugar do texto de apoio. */
  loading?: boolean;
  action?: ReactNode;
}

/** Tela inteira de espera, aviso ou erro (carregando projeto, sem acesso...). */
export function FullPageStatus({ title, description, loading = false, action }: FullPageStatusProps) {
  return (
    <div className="flex min-h-viewport items-center justify-center px-4" role={loading ? 'status' : undefined}>
      <div className="flex w-full max-w-sm flex-col items-center gap-3 text-center">
        {loading && <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />}
        <h1 className="text-base font-semibold">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
        {action}
      </div>
    </div>
  );
}
