import { useQuery, useQueryClient } from '@tanstack/react-query';
import { collection, getDocs, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useEffect } from 'react';
import { firestorePaths } from '@shared/firestore/paths';
import type { FileDoc } from '@shared/firestore/types';
import { getFirebase, isFirebaseConfigured } from '@/lib/firebase/app';
import { queryKeys } from '@/lib/query-keys';
import { DEMO_FILES, toEditorFile, type EditorFile } from '../model/editor-file';

function filesQuery(projectId: string) {
  return query(collection(getFirebase().db, firestorePaths.files(projectId)), orderBy('path'));
}

/**
 * Arquivos do projeto em tempo real. A primeira carga vem de `getDocs`
 * (React Query), e o `onSnapshot` mantém o cache atualizado depois disso.
 */
export function useProjectFiles(projectId: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    return onSnapshot(filesQuery(projectId), (snapshot) => {
      queryClient.setQueryData<EditorFile[]>(
        queryKeys.files(projectId),
        snapshot.docs.map((doc) => toEditorFile(doc.id, doc.data() as FileDoc)),
      );
    });
  }, [projectId, queryClient]);

  return useQuery({
    queryKey: queryKeys.files(projectId),
    queryFn: async (): Promise<EditorFile[]> => {
      if (!isFirebaseConfigured) return DEMO_FILES;
      const snapshot = await getDocs(filesQuery(projectId));
      return snapshot.docs.map((doc) => toEditorFile(doc.id, doc.data() as FileDoc));
    },
    staleTime: Number.POSITIVE_INFINITY,
  });
}
