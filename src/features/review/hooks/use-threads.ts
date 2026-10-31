import { useQuery, useQueryClient } from '@tanstack/react-query';
import { collection, getDocs, onSnapshot, orderBy, query, type QuerySnapshot } from 'firebase/firestore';
import { useEffect } from 'react';
import { firestorePaths } from '@shared/firestore/paths';
import type { CommentDoc, ThreadDoc } from '@shared/firestore/types';
import { getFirebase } from '@/lib/firebase/app';
import { queryKeys } from '@/lib/query-keys';
import { sortThreads, toCommentSummary, toThreadSummary, type CommentSummary, type ThreadSummary } from '../model/review';

function threadsFrom(snapshot: QuerySnapshot): ThreadSummary[] {
  return sortThreads(snapshot.docs.map((item) => toThreadSummary(item.id, item.data({ serverTimestamps: 'estimate' }) as ThreadDoc)));
}

/** Threads da revisão (membros e o revisor), em tempo real, na ordem de leitura do PDF. */
export function useThreads(projectId: string, reviewId: string, enabled: boolean) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(
      collection(getFirebase().db, firestorePaths.threads(projectId, reviewId)),
      (snapshot) => queryClient.setQueryData(queryKeys.threads(projectId, reviewId), threadsFrom(snapshot)),
      () => undefined,
    );
  }, [projectId, reviewId, queryClient, enabled]);

  return useQuery({
    queryKey: queryKeys.threads(projectId, reviewId),
    enabled,
    queryFn: async () => threadsFrom(await getDocs(collection(getFirebase().db, firestorePaths.threads(projectId, reviewId)))),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

/** Comentários de uma thread, em ordem de criação. */
export function useComments(projectId: string, reviewId: string, threadId: string) {
  const queryClient = useQueryClient();
  const key = [...queryKeys.threads(projectId, reviewId), threadId, 'comments'] as const;

  useEffect(() => {
    const commentsQuery = query(collection(getFirebase().db, firestorePaths.comments(projectId, reviewId, threadId)), orderBy('createdAt'));
    return onSnapshot(
      commentsQuery,
      (snapshot) =>
        queryClient.setQueryData<CommentSummary[]>(
          [...queryKeys.threads(projectId, reviewId), threadId, 'comments'],
          snapshot.docs.map((item) => toCommentSummary(item.id, item.data({ serverTimestamps: 'estimate' }) as CommentDoc)),
        ),
      () => undefined,
    );
  }, [projectId, reviewId, threadId, queryClient]);

  return useQuery({
    queryKey: key,
    queryFn: async () => {
      const snapshot = await getDocs(
        query(collection(getFirebase().db, firestorePaths.comments(projectId, reviewId, threadId)), orderBy('createdAt')),
      );
      return snapshot.docs.map((item) => toCommentSummary(item.id, item.data({ serverTimestamps: 'estimate' }) as CommentDoc));
    },
    staleTime: Number.POSITIVE_INFINITY,
  });
}
