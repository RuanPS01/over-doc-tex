import { EmailAuthProvider, reauthenticateWithCredential, sendPasswordResetEmail, updatePassword, updateProfile } from 'firebase/auth';
import { collection, FieldPath, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { useMemo } from 'react';
import { firestorePaths } from '@shared/firestore/paths';
import { memberProfileOf } from '@/features/projects/model/new-project';
import { emailLinkUrl } from '@/lib/email';
import { getFirebase } from '@/lib/firebase/app';
import { t } from '@/lib/i18n';
import { useAuth } from './use-auth';

/** Limite de gravações por lote do Firestore, com folga. */
const BATCH_SIZE = 400;

function currentUser() {
  const user = getFirebase().auth.currentUser;
  if (!user) throw new Error(t('Entre na sua conta para continuar.'));
  return user;
}

/** Nome sem espaços sobrando, no tamanho que as telas e as regras aceitam. */
export function cleanDisplayName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').slice(0, 80);
}

/**
 * Perfil da conta: nome (no Firebase Authentication e em memberProfiles de
 * cada projeto em que a pessoa é membro, que é o que os coautores veem) e
 * senha (troca com a senha atual ou link por e-mail do Firebase).
 */
export function useProfile() {
  const { refreshUser } = useAuth();

  return useMemo(
    () => ({
      /** Grava o nome e devolve em quantos projetos ele foi atualizado. */
      saveName: async (raw: string): Promise<number> => {
        const user = currentUser();
        const name = cleanDisplayName(raw);
        if (!name) throw new Error(t('Informe um nome.'));
        await updateProfile(user, { displayName: name });
        refreshUser();
        const { db } = getFirebase();
        const projects = await getDocs(query(collection(db, firestorePaths.projects()), where('memberIds', 'array-contains', user.uid)));
        const profile = memberProfileOf(user);
        // As regras deixam cada membro mudar só a própria entrada em memberProfiles.
        for (let start = 0; start < projects.docs.length; start += BATCH_SIZE) {
          const batch = writeBatch(db);
          for (const project of projects.docs.slice(start, start + BATCH_SIZE)) batch.update(project.ref, new FieldPath('memberProfiles', user.uid), profile);
          await batch.commit();
        }
        return projects.size;
      },

      /** Troca a senha confirmando a atual (o Firebase exige login recente para isso). */
      changePassword: async (currentPassword: string, nextPassword: string) => {
        const user = currentUser();
        if (!user.email) throw new Error(t('Esta conta não tem e-mail para confirmar a senha.'));
        await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPassword));
        await updatePassword(user, nextPassword);
      },

      /** Link do Firebase para criar uma senha nova (também serve para quem só entra com Google ou link de acesso). */
      sendPasswordLink: async () => {
        const user = currentUser();
        if (!user.email) throw new Error(t('Esta conta não tem e-mail para receber o link.'));
        await sendPasswordResetEmail(getFirebase().auth, user.email, { url: emailLinkUrl(user.email, '/') });
        return user.email;
      },
    }),
    [refreshUser],
  );
}
