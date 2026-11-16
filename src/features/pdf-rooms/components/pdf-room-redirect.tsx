import { Redirect } from 'wouter';
import { FullPageStatus } from '@/components/common/full-page-status';
import { reviewPath } from '@/features/review/model/review';
import { useT } from '@/hooks/use-t';
import { usePdfRoomRounds } from '../hooks/use-pdf-rooms';

/**
 * Sala de PDF avulso aberta pela rota do editor (/p/:id, como numa
 * notificação sem revisão): não há código para editar, então vai para a
 * rodada mais recente, ou para a tela inicial quando ainda não há nenhuma.
 */
export function PdfRoomRedirect({ projectId }: { projectId: string }) {
  const { t } = useT();
  const { data: rounds, isPending } = usePdfRoomRounds(projectId);
  if (isPending) return <FullPageStatus title={t('Abrindo a sala de revisão')} loading />;
  const latest = rounds?.[0];
  return <Redirect to={latest ? reviewPath(projectId, latest.id) : '/'} replace />;
}
