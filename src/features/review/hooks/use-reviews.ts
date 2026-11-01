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
 * Revisões pedidas ao e-mail do usuário, em qualquer projeto: as que o
 * convidaram na criação (reviewerEmail) e as que o acrescentaram depois
 * (reviewerEmails), cada uma com o seu índice de collection group. As regras
 * exigem e-mail verificado; sem ele a lista fica vazia.
 */
export function useMyReviews() {
  const { user } = useAuth();
  const email = user?.emailVerified ? (user.email?.toLowerCase() ?? null) : null;

  return useQuery({
    queryKey: ['my-reviews', email ?? ''] as const,
    enabled: isFirebaseConfigured && email !== null,
    queryFn: async (): Promise<ReviewSummary[]> => {
      const reviews = collectionGroup(getFirebase().db, 'reviews');
      const [invited, added] = await Promise.all([
        getDocs(query(reviews, where('reviewerEmail', '==', email), orderBy('lastActivityAt', 'desc'))),
        getDocs(query(reviews, where('reviewerEmails', 'array-contains', email), orderBy('lastActivityAt', 'desc'))),
      ]);
      const byPath = new Map([...invited.docs, ...added.docs].map((item) => [item.ref.path, item]));
      return [...byPath.values()]
        .map((item) => toReviewSummary(item.ref.parent.parent?.id ?? '', item.id, item.data({ serverTimestamps: 'estimate' }) as ReviewDoc))
        .sort((a, b) => (b.lastActivityAt?.getTime() ?? 0) - (a.lastActivityAt?.getTime() ?? 0));
    },
    staleTime: 60_000,
  });
}
