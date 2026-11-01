import { useQuery, useQueryClient } from '@tanstack/react-query';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { useEffect } from 'react';
import { firestorePaths } from '@shared/firestore/paths';
import type { MemberProfile, ProjectDoc, ProjectRole } from '@shared/firestore/types';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { getFirebase, isFirebaseConfigured } from '@/lib/firebase/app';
import { msg, t } from '@/lib/i18n';
import { queryKeys } from '@/lib/query-keys';

export const DEMO_PROJECT_NAME = msg('Revisão Colaborativa de Documentos LaTeX');

export interface ProjectInfo {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  members: Record<string, ProjectRole>;
  pendingMembers: Record<string, 'editor' | 'viewer'>;
  memberProfiles: Record<string, MemberProfile>;
  latestSnapshotId: string | null;
}

/** Papel do usuário no projeto; nulo para quem só tem um convite pendente. */
export function roleOf(project: ProjectInfo, uid: string | null | undefined): ProjectRole | null {
  return uid ? (project.members[uid] ?? null) : null;
}

function toProjectInfo(id: string, data: ProjectDoc): ProjectInfo {
  return {
    id,
    name: data.name,
    description: data.description ?? null,
    ownerId: data.ownerId,
    members: data.members ?? {},
    pendingMembers: data.pendingMembers ?? {},
    memberProfiles: data.memberProfiles ?? {},
    latestSnapshotId: data.latestSnapshotId ?? null,
  };
}

const demoProject = (): Omit<ProjectInfo, 'id'> => ({
  name: t(DEMO_PROJECT_NAME),
  description: null,
  ownerId: 'demo',
  members: { demo: 'owner' },
  pendingMembers: {},
  memberProfiles: { demo: { name: t('Você'), email: '' } },
  latestSnapshotId: null,
});

/**
 * Projeto aberto no editor. Nulo quando não existe ou o usuário não pode
 * vê-lo: as regras respondem "sem permissão" nos dois casos, de propósito.
 * Quem tem convite pendente lê o projeto (para aceitar), mas não é membro.
 */
export function useProject(projectId: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  useEffect(() => {
    if (!isFirebaseConfigured || !uid) return;
    return onSnapshot(
      doc(getFirebase().db, firestorePaths.project(projectId)),
      (snapshot) => {
        const data = snapshot.data() as ProjectDoc | undefined;
        queryClient.setQueryData<ProjectInfo | null>(queryKeys.project(projectId), data ? toProjectInfo(projectId, data) : null);
      },
      () => queryClient.setQueryData<ProjectInfo | null>(queryKeys.project(projectId), null),
    );
  }, [projectId, queryClient, uid]);

  return useQuery({
    queryKey: queryKeys.project(projectId),
    queryFn: async (): Promise<ProjectInfo | null> => {
      if (!isFirebaseConfigured) return { id: projectId, ...demoProject() };
      try {
        const snapshot = await getDoc(doc(getFirebase().db, firestorePaths.project(projectId)));
        const data = snapshot.data() as ProjectDoc | undefined;
        return data ? toProjectInfo(projectId, data) : null;
      } catch (error) {
        if ((error as { code?: string }).code === 'permission-denied') return null;
        throw error;
      }
    },
    staleTime: Number.POSITIVE_INFINITY,
  });
}
