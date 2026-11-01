import { useQuery, useQueryClient } from '@tanstack/react-query';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { useEffect } from 'react';
import { firestorePaths } from '@shared/firestore/paths';
import type { ReviewDoc } from '@shared/firestore/types';
import { getFirebase, isFirebaseConfigured } from '@/lib/firebase/app';
import { toReviewSummary, type ReviewSummary } from '../model/review';

/** Chave da revisão no cache (exportada para quem precisa descartá-la, como a entrada pelo link). */
export const reviewKey = (projectId: string, reviewId: string) => ['project', projectId, 'reviews', reviewId] as const;

/**
 * Uma revisão, em tempo real. Nulo quando não existe ou a conta não é membro
 * nem o revisor (as regras respondem "sem permissão" nos dois casos).
 */
export function useReview(projectId: string, reviewId: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    return onSnapshot(
      doc(getFirebase().db, firestorePaths.review(projectId, reviewId)),
      (snapshot) => {
        const data = snapshot.data({ serverTimestamps: 'estimate' }) as ReviewDoc | undefined;
        queryClient.setQueryData(reviewKey(projectId, reviewId), data ? toReviewSummary(projectId, reviewId, data) : null);
      },
      () => queryClient.setQueryData(reviewKey(projectId, reviewId), null),
    );
  }, [projectId, reviewId, queryClient]);

  return useQuery({
    queryKey: reviewKey(projectId, reviewId),
    enabled: isFirebaseConfigured,
    queryFn: async (): Promise<ReviewSummary | null> => {
      try {
        const snapshot = await getDoc(doc(getFirebase().db, firestorePaths.review(projectId, reviewId)));
        const data = snapshot.data() as ReviewDoc | undefined;
        return data ? toReviewSummary(projectId, reviewId, data) : null;
      } catch (error) {
        if ((error as { code?: string }).code === 'permission-denied') return null;
        throw error;
      }
    },
    staleTime: Number.POSITIVE_INFINITY,
  });
}
