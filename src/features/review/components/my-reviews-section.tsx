import { useMyReviews } from '../hooks/use-reviews';
import { ReviewList } from './review-list';

/** "Revisões para você": revisões pedidas ao e-mail da conta, em qualquer projeto. Some quando não há nenhuma. */
export function MyReviewsSection() {
  const { data: reviews = [], isSuccess } = useMyReviews();
  if (!isSuccess || reviews.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-base font-semibold">Revisões para você</h2>
      <ReviewList reviews={reviews} isPending={false} showProject emptyText="" />
    </section>
  );
}
