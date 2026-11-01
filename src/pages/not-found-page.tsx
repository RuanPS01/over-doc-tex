import { Link } from 'wouter';
import { PageCornerBar } from '@/components/common/page-corner-bar';
import { Button } from '@/components/ui/button';
import { useT } from '@/hooks/use-t';

export default function NotFoundPage() {
  const { t } = useT();
  return (
    <div className="flex min-h-viewport flex-col items-center justify-center gap-3 px-4 text-center">
      <PageCornerBar />
      <h1 className="text-lg font-semibold">{t('Página não encontrada')}</h1>
      <Button asChild>
        <Link href="/">{t('Voltar aos projetos')}</Link>
      </Button>
    </div>
  );
}
