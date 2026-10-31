import { Link, useParams } from 'wouter';
import { Button } from '@/components/ui/button';

/**
 * Rota /p/:projectId/reviews/:reviewId: visão do revisor sobre um snapshot
 * congelado. A composição prevista está em docs/04-componentes-e-telas.md
 * (ReviewShell, PdfViewer com camadas de seleção e desenho, ThreadSidebar).
 */
export default function ReviewPage() {
  const { projectId, reviewId } = useParams<{ projectId: string; reviewId: string }>();
  return (
    <div className="flex min-h-viewport flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-lg font-semibold">Revisão #{reviewId}</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Tela do revisor em construção: PDF da versão congelada, comentários ancorados em trechos e pins com
        desenho livre.
      </p>
      <Button variant="outline" asChild>
        <Link href={`/p/${projectId}`}>Abrir o editor do projeto</Link>
      </Button>
    </div>
  );
}
