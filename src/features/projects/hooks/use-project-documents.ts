import { useQuery, useQueryClient } from '@tanstack/react-query';
import { collection, deleteDoc, doc, getDocs, onSnapshot, orderBy, query, serverTimestamp, setDoc, type QuerySnapshot } from 'firebase/firestore';
import { useEffect, useMemo } from 'react';
import { firestorePaths } from '@shared/firestore/paths';
import type { DocumentDoc, DocumentRole } from '@shared/firestore/types';
import { getFirebase, isFirebaseConfigured } from '@/lib/firebase/app';
import { MAIN_DOCUMENT_ID, MAIN_FILE_PATH } from '../model/new-project';

/** Documento compilável como a interface usa. */
export interface ProjectDocument {
  id: string;
  title: string;
  role: DocumentRole;
  rootPath: string;
  order: number;
}

const documentsKey = (projectId: string) => ['project', projectId, 'documents'] as const;

function documentsQuery(projectId: string) {
  return query(collection(getFirebase().db, firestorePaths.documents(projectId)), orderBy('order'));
}

function fromSnapshot(snapshot: QuerySnapshot): ProjectDocument[] {
  return snapshot.docs.map((item) => {
    const data = item.data() as DocumentDoc;
    return { id: item.id, title: data.title, role: data.role, rootPath: data.rootPath, order: data.order };
  });
}

/** Projeto antigo ou importado sem o documento principal gravado: o principal é implícito. */
export function withMainDocument(documents: readonly ProjectDocument[], projectName: string): ProjectDocument[] {
  if (documents.some((item) => item.id === MAIN_DOCUMENT_ID)) return [...documents];
  return [{ id: MAIN_DOCUMENT_ID, title: projectName, role: 'main', rootPath: MAIN_FILE_PATH, order: 0 }, ...documents];
}

/** Documentos do projeto (principal e secundários), em tempo real, na ordem de exibição. */
export function useProjectDocuments(projectId: string, enabled = true) {
  const queryClient = useQueryClient();
  const isActive = enabled && isFirebaseConfigured;

  useEffect(() => {
    if (!isActive) return;
    return onSnapshot(
      documentsQuery(projectId),
      (snapshot) => queryClient.setQueryData(documentsKey(projectId), fromSnapshot(snapshot)),
      () => undefined,
    );
  }, [projectId, queryClient, isActive]);

  const result = useQuery({
    queryKey: documentsKey(projectId),
    enabled: isActive,
    queryFn: async () => fromSnapshot(await getDocs(documentsQuery(projectId))),
    staleTime: Number.POSITIVE_INFINITY,
  });

  const actions = useMemo(
    () => ({
      /** Documento secundário: outro .tex com \documentclass que gera um PDF próprio (apêndice, carta de resposta). */
      addDocument: async (input: { title: string; rootFileId: string; rootPath: string; order: number }) => {
        const ref = doc(collection(getFirebase().db, firestorePaths.documents(projectId)));
        const data: Omit<DocumentDoc, 'createdAt' | 'updatedAt'> & Record<'createdAt' | 'updatedAt', unknown> = {
          title: input.title,
          role: 'secondary',
          rootFileId: input.rootFileId,
          rootPath: input.rootPath,
          engine: null,
          order: input.order,
          lastBuild: null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        await setDoc(ref, data);
      },
      /** As regras só deixam apagar secundários. */
      removeDocument: (documentId: string) => deleteDoc(doc(getFirebase().db, firestorePaths.document(projectId, documentId))),
    }),
    [projectId],
  );

  return { ...result, ...actions };
}

/** Lista para o congelamento (leitura única, sem tempo real). */
export async function readProjectDocuments(projectId: string): Promise<ProjectDocument[]> {
  return fromSnapshot(await getDocs(documentsQuery(projectId)));
}
