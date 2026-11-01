import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { useEffect } from 'react';
import { firestorePaths } from '@shared/firestore/paths';
import type { ProjectDoc, ProjectRole } from '@shared/firestore/types';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { getFirebase, isFirebaseConfigured } from '@/lib/firebase/app';
import { t } from '@/lib/i18n';
import { queryKeys } from '@/lib/query-keys';
import { sha256Hex } from '@/lib/stored-files/chunks';
import { MAIN_DOCUMENT_ID, MAIN_FILE_ID, buildNewProject, memberProfileOf, starterTex } from '../model/new-project';

export interface ProjectSummary {
  id: string;
  name: string;
  role: ProjectRole;
  updatedAt: Date | null;
}

function toSummary(snapshot: QueryDocumentSnapshot, uid: string): ProjectSummary {
  // "estimate": um projeto recém-criado aparece antes de o servidor confirmar a data.
  const data = snapshot.data({ serverTimestamps: 'estimate' }) as ProjectDoc;
  return {
    id: snapshot.id,
    name: data.name,
    role: data.members[uid] ?? 'viewer',
    updatedAt: data.updatedAt?.toDate() ?? null,
  };
}

function projectsQuery(uid: string) {
  // Usa o índice composto memberIds (contains) + updatedAt desc de firestore.indexes.json.
  return query(
    collection(getFirebase().db, firestorePaths.projects()),
    where('memberIds', 'array-contains', uid),
    orderBy('updatedAt', 'desc'),
  );
}

/** Projetos de que o usuário é membro, em tempo real. */
export function useProjects() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  useEffect(() => {
    if (!isFirebaseConfigured || !uid) return;
    return onSnapshot(
      projectsQuery(uid),
      (snapshot) => {
        queryClient.setQueryData<ProjectSummary[]>(
          queryKeys.projects(uid),
          snapshot.docs.map((item) => toSummary(item, uid)),
        );
      },
      // A primeira carga (getDocs) já expõe o erro na tela; aqui só evita o erro não tratado.
      () => undefined,
    );
  }, [uid, queryClient]);

  return useQuery({
    queryKey: queryKeys.projects(uid ?? 'anonimo'),
    enabled: isFirebaseConfigured && uid !== null,
    queryFn: async (): Promise<ProjectSummary[]> => {
      const snapshot = await getDocs(projectsQuery(uid!));
      return snapshot.docs.map((item) => toSummary(item, uid!));
    },
    staleTime: Number.POSITIVE_INFINITY,
  });
}

/** Cria o projeto (o usuário como dono), o documento principal e o main.tex inicial. */
export function useCreateProject() {
  return useMutation({
    mutationFn: async (name: string): Promise<string> => {
      const { db, auth } = getFirebase();
      const user = auth.currentUser;
      if (!user) throw new Error(t('Entre na sua conta para criar projetos.'));
      const uid = user.uid;

      const projectRef = doc(collection(db, firestorePaths.projects()));
      const content = starterTex(name);
      const docs = buildNewProject({
        uid,
        profile: memberProfileOf(user),
        name,
        content,
        contentHash: await sha256Hex(new TextEncoder().encode(content)),
        now: serverTimestamp(),
      });

      await setDoc(projectRef, docs.project);
      // Segundo lote: as regras de documents e files leem o projeto, que precisa já existir.
      const batch = writeBatch(db);
      batch.set(doc(db, firestorePaths.document(projectRef.id, MAIN_DOCUMENT_ID)), docs.document);
      batch.set(doc(db, firestorePaths.file(projectRef.id, MAIN_FILE_ID)), docs.file);
      await batch.commit();
      return projectRef.id;
    },
  });
}
