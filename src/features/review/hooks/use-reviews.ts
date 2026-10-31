import { useQuery, useQueryClient } from '@tanstack/react-query';
import { collection, collectionGroup, getDocs, onSnapshot, orderBy, query, where, type QuerySnapshot } from 'firebase/firestore';
import { useEffect } from 'react';
import { firestorePaths } from '@shared/firestore/paths';
import type { ReviewDoc } from '@shared/firestore/types';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { getFirebase, isFirebaseConfigured } from '@/lib/firebase/app';
import { queryKeys } from '@/lib/query-keys';
import { toReviewSummary, type ReviewSummary } from '../model/review';

function projectReviewsQuery(projectId: string) {
  return query(collection(getFirebase().db, firestorePaths.reviews(projectId)), orderBy('number', 'desc'));
}

function fromProject(projectId: string, snapshot: QuerySnapshot): ReviewSummary[] {
  return snapshot.docs.map((item) => toReviewSummary(projectId, item.id, item.data({ serverTimestamps: 'estimate' }) as ReviewDoc));
}

/** Fila de revisões do projeto, da mais nova para a mais antiga (membros). */
export function useReviews(projectId: string, enabled = true) {
  const queryClient = useQueryClient();
  const isActive = enabled && isFirebaseConfigured;

  useEffect(() => {
    if (!isActive) return;
    return onSnapshot(
      projectReviewsQuery(projectId),
      (snapshot) => queryClient.setQueryData(queryKeys.reviews(projectId), fromProject(projectId, snapshot)),
      () => undefined,
    );
  }, [projectId, queryClient, isActive]);

  return useQuery({
    queryKey: queryKeys.reviews(projectId),
    enabled: isActive,
    queryFn: async () => fromProject(projectId, await getDocs(projectReviewsQuery(projectId))),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

/**
 * Revisões pedidas ao e-mail do usuário, em qualquer projeto (índice de
 * collection group reviewerEmail + lastActivityAt). As regras exigem e-mail
 * verificado; sem ele a lista fica vazia.
 */
export function useMyReviews() {
  const { user } = useAuth();
  const email = user?.emailVerified ? (user.email?.toLowerCase() ?? null) : null;

  return useQuery({
    queryKey: ['my-reviews', email ?? ''] as const,
    enabled: isFirebaseConfigured && email !== null,
    queryFn: async (): Promise<ReviewSummary[]> => {
      const snapshot = await getDocs(
        query(collectionGroup(getFirebase().db, 'reviews'), where('reviewerEmail', '==', email), orderBy('lastActivityAt', 'desc')),
      );
      return snapshot.docs.map((item) =>
        toReviewSummary(item.ref.parent.parent?.id ?? '', item.id, item.data({ serverTimestamps: 'estimate' }) as ReviewDoc),
      );
    },
    staleTime: 60_000,
  });
}
