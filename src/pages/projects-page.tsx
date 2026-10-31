import { FileText, Plus } from 'lucide-react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/hooks/use-auth';

/** Rota /. Lista de projetos (no modo demonstração, um projeto de exemplo). */
export default function ProjectsPage() {
  const { status } = useAuth();

  return (
    <div className="mx-auto flex min-h-viewport w-full max-w-4xl flex-col gap-6 px-4 py-6">
      <header className="flex items-center gap-3">
        <h1 className="min-w-0 flex-1 truncate text-xl font-semibold">Meus projetos</h1>
        <Button size="sm">
          <Plus />
          <span className="hidden xs:inline">Novo projeto</span>
        </Button>
      </header>

      {status === 'demo' && (
        <p className="rounded-md border border-warning/50 bg-warning/10 p-3 text-sm">
          Modo demonstração: configure o Firebase no arquivo .env para salvar projetos.
        </p>
      )}

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <li>
          <Link
            href="/p/demo"
            className="flex min-w-0 items-center gap-3 rounded-lg border bg-card p-4 transition-colors hover:bg-accent"
          >
            <FileText className="size-5 shrink-0 text-primary" />
            <span className="min-w-0">
              <span className="block truncate font-medium">Revisão Colaborativa de Documentos LaTeX</span>
              <span className="block text-xs text-muted-foreground">Versão 1.0 em revisão</span>
            </span>
          </Link>
        </li>
      </ul>
    </div>
  );
}
