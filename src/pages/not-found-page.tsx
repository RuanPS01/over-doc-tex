import { Link } from 'wouter';
import { Button } from '@/components/ui/button';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-viewport flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-lg font-semibold">Página não encontrada</h1>
      <Button asChild>
        <Link href="/">Voltar aos projetos</Link>
      </Button>
    </div>
  );
}
