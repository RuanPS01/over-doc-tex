import { useQuery, useQueryClient } from '@tanstack/react-query';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { useEffect } from 'react';
import { firestorePaths } from '@shared/firestore/paths';
import type { ProjectDoc } from '@shared/firestore/types';
import { getFirebase, isFirebaseConfigured } from '@/lib/firebase/app';
import { queryKeys } from '@/lib/query-keys';

export const DEMO_PROJECT_NAME = 'Revisão Colaborativa de Documentos LaTeX';

export interface ProjectInfo {
  id: string;
  name: string;
}

/**
 * Projeto aberto no editor. Nulo quando não existe ou o usuário não é membro:
 * as regras respondem "sem permissão" nos dois casos, de propósito.
 */
export function useProject(projectId: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    return onSnapshot(
      doc(getFirebase().db, firestorePaths.project(projectId)),
      (snapshot) => {
        const data = snapshot.data() as ProjectDoc | undefined;
        queryClient.setQueryData<ProjectInfo | null>(
          queryKeys.project(projectId),
          data ? { id: projectId, name: data.name } : null,
        );
      },
      () => queryClient.setQueryData<ProjectInfo | null>(queryKeys.project(projectId), null),
    );
  }, [projectId, queryClient]);

  return useQuery({
    queryKey: queryKeys.project(projectId),
    queryFn: async (): Promise<ProjectInfo | null> => {
      if (!isFirebaseConfigured) return { id: projectId, name: DEMO_PROJECT_NAME };
      try {
        const snapshot = await getDoc(doc(getFirebase().db, firestorePaths.project(projectId)));
        const data = snapshot.data() as ProjectDoc | undefined;
        return data ? { id: projectId, name: data.name } : null;
      } catch (error) {
        if ((error as { code?: string }).code === 'permission-denied') return null;
        throw error;
      }
    },
    staleTime: Number.POSITIVE_INFINITY,
  });
}
