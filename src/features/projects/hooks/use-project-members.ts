import {
  FieldPath,
  arrayRemove,
  arrayUnion,
  deleteField,
  doc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { useMemo } from 'react';
import { firestorePaths } from '@shared/firestore/paths';
import type { MemberProfile } from '@shared/firestore/types';
import { getFirebase } from '@/lib/firebase/app';
import { t } from '@/lib/i18n';
import { memberProfileOf } from '../model/new-project';

export type InviteRole = 'editor' | 'viewer';

function currentUser() {
  const user = getFirebase().auth.currentUser;
  if (!user) throw new Error(t('Entre na sua conta para continuar.'));
  return user;
}

/**
 * Detalhes, membros e convites do projeto. Cada função é uma única
 * gravação, no formato que firestore.rules confere (editingDetails,
 * managingMembers, claimingInvite e updatingOwnProfile). E-mails têm ponto,
 * por isso as chaves dos mapas vão por FieldPath, nunca por "campo.chave".
 */
export function useProjectMembers(projectId: string) {
  return useMemo(() => {
    const ref = () => doc(getFirebase().db, firestorePaths.project(projectId));
    const touched = () => ['updatedAt', serverTimestamp()] as const;

    return {
      saveDetails: (details: { name: string; description: string | null }) =>
        updateDoc(ref(), { ...details, updatedAt: serverTimestamp() }),

      invite: (email: string, role: InviteRole) =>
        updateDoc(ref(), new FieldPath('pendingMembers', email.trim().toLowerCase()), role, ...touched()),

      cancelInvite: (email: string) => updateDoc(ref(), new FieldPath('pendingMembers', email), deleteField(), ...touched()),

      changeRole: (uid: string, role: InviteRole) => updateDoc(ref(), new FieldPath('members', uid), role, ...touched()),

      removeMember: (uid: string) =>
        updateDoc(
          ref(),
          new FieldPath('members', uid),
          deleteField(),
          'memberIds',
          arrayRemove(uid),
          new FieldPath('memberProfiles', uid),
          deleteField(),
          ...touched(),
        ),

      /** O convidado entra com o papel do convite do próprio e-mail, e o convite some. */
      acceptInvite: (role: InviteRole) => {
        const user = currentUser();
        const email = (user.email ?? '').toLowerCase();
        return updateDoc(
          ref(),
          new FieldPath('members', user.uid),
          role,
          'memberIds',
          arrayUnion(user.uid),
          new FieldPath('pendingMembers', email),
          deleteField(),
          new FieldPath('memberProfiles', user.uid),
          memberProfileOf(user),
          ...touched(),
        );
      },

      /** Projetos antigos não têm a entrada do membro: ele mesmo a grava ao abrir. */
      saveOwnProfile: () => {
        const user = currentUser();
        const profile: MemberProfile = memberProfileOf(user);
        return updateDoc(ref(), new FieldPath('memberProfiles', user.uid), profile);
      },
    };
  }, [projectId]);
}
