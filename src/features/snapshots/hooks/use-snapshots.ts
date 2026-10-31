import { useQuery, useQueryClient } from '@tanstack/react-query';
import { collection, getDocs, onSnapshot, orderBy, query, type QueryDocumentSnapshot } from 'firebase/firestore';
import { useEffect } from 'react';
import { firestorePaths } from '@shared/firestore/paths';
import type { SnapshotDoc } from '@shared/firestore/types';
import { getFirebase, isFirebaseConfigured } from '@/lib/firebase/app';
import { queryKeys } from '@/lib/query-keys';

/** Versão congelada como a interface usa: o documento com id e data já convertida. */
export interface SnapshotSummary extends Omit<SnapshotDoc, 'createdAt'> {
  id: string;
  createdAt: Date | null;
}

export function toSnapshotSummary(id: string, data: SnapshotDoc): SnapshotSummary {
  return { ...data, id, createdAt: data.createdAt?.toDate() ?? null };
}

function snapshotsQuery(projectId: string) {
  return query(collection(getFirebase().db, firestorePaths.snapshots(projectId)), orderBy('sequence', 'desc'));
}

function toSummary(snapshot: QueryDocumentSnapshot): SnapshotSummary {
  return toSnapshotSummary(snapshot.id, snapshot.data({ serverTimestamps: 'estimate' }) as SnapshotDoc);
}

/** Versões do projeto, da mais nova para a mais antiga, em tempo real (só membros). */
export function useSnapshots(projectId: string, enabled = true) {
  const queryClient = useQueryClient();
  const isActive = enabled && isFirebaseConfigured;

  useEffect(() => {
    if (!isActive) return;
    return onSnapshot(
      snapshotsQuery(projectId),
      (snapshot) => queryClient.setQueryData<SnapshotSummary[]>(queryKeys.snapshots(projectId), snapshot.docs.map(toSummary)),
      () => undefined,
    );
  }, [projectId, queryClient, isActive]);

  return useQuery({
    queryKey: queryKeys.snapshots(projectId),
    enabled: isActive,
    queryFn: async () => (await getDocs(snapshotsQuery(projectId))).docs.map(toSummary),
    staleTime: Number.POSITIVE_INFINITY,
  });
}
