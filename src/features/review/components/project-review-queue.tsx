import { useReviews } from '../hooks/use-reviews';
import { ReviewList } from './review-list';

/** Fila de revisões do projeto (aba "Revisões" do histórico). */
export function ProjectReviewQueue({ projectId, enabled }: { projectId: string; enabled: boolean }) {
  const { data: reviews = [], isPending } = useReviews(projectId, enabled);
  return (
    <ReviewList reviews={reviews} isPending={isPending} emptyText="Nenhuma revisão ainda. Use Solicitar revisão para convidar alguém." />
  );
}
