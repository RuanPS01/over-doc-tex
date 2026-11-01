import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useCallback, useEffect, useRef, useState } from 'react';
import { firestorePaths } from '@shared/firestore/paths';
import type { ReviewGuestDoc } from '@shared/firestore/types';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { memberProfileOf } from '@/features/projects/model/new-project';
import { getFirebase } from '@/lib/firebase/app';
import { t } from '@/lib/i18n';
import { accountGuestKey, guestKeyOf } from '../model/review';
import type { GuestIdentity } from './use-review-actions';

/** Nome do revisor guardado neste navegador: vale para qualquer link de revisão. */
const NAME_KEY = 'overdoctex.review-guest-name';

function readCachedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

function cacheName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // Sem armazenamento: o nome é pedido de novo na próxima vez.
  }
}

export type GuestSession =
  | { status: 'starting' }
  | { status: 'need-name'; suggestion: string }
  | { status: 'saving' }
  | { status: 'ready'; identity: GuestIdentity }
  | { status: 'error'; message: string };

const errorMessage = (error: unknown): string => {
  const code = (error as { code?: string }).code ?? '';
  if (code === 'auth/operation-not-allowed' || code === 'auth/admin-restricted-operation') {
    return t('O acesso sem conta não está ativado neste site (Firebase Authentication, provedor "Anônimo"). Peça a quem enviou o link para entrar com o seu e-mail.');
  }
  if (code === 'permission-denied') return t('Este link não vale mais: ele foi trocado ou a revisão passou a exigir login. Peça um link novo a quem enviou.');
  return t('Não foi possível abrir a revisão pelo link. Confira a conexão e tente de novo.');
};

/**
 * Revisor pelo link. Com a conta aberta, entra com ela: a ficha leva o nome da
 * conta e a chave accountGuestKey, sem pedir nome. Sem conta, entra com login
 * anônimo e pede o nome; o nome fica neste navegador e é usado de novo nos
 * próximos links, e em outro aparelho o mesmo nome continua sendo o mesmo
 * revisor (guestKeyOf). Nos dois casos a ficha de visitante leva o código do
 * link, que é o que as regras conferem.
 */
export function useReviewGuest(projectId: string, reviewId: string, snapshotId: string, token: string) {
  const { status, user, signInAsGuest } = useAuth();
  const [session, setSession] = useState<GuestSession>({ status: 'starting' });
  const started = useRef(false);
  const viaAccount = status === 'signed-in';

  /** Grava a ficha (nome e chave) e libera a revisão. */
  const save = useCallback(
    async (name: string, key: string, account: boolean) => {
      if (!user || !key) return;
      setSession({ status: 'saving' });
      try {
        const guest: Omit<ReviewGuestDoc, 'createdAt'> & { createdAt: unknown } = { reviewId, token, name, guestKey: key, createdAt: serverTimestamp() };
        await setDoc(doc(getFirebase().db, firestorePaths.snapshotGuest(projectId, snapshotId, user.uid)), guest);
        if (!account) cacheName(name);
        setSession({ status: 'ready', identity: { name, key, viaAccount: account } });
      } catch (error) {
        setSession({ status: 'error', message: errorMessage(error) });
      }
    },
    [user, projectId, reviewId, snapshotId, token],
  );

  /** Nome digitado por quem entrou sem conta. */
  const register = useCallback(
    async (rawName: string) => {
      const name = rawName.trim().replace(/\s+/g, ' ').slice(0, 80);
      await save(name, guestKeyOf(name), false);
    },
    [save],
  );

  // A conferência da ficha roda uma vez por sessão; a gravação usa sempre a versão atual.
  const saveRef = useRef(save);
  saveRef.current = save;

  // Sem sessão: entra como visitante (uma vez).
  useEffect(() => {
    if (status !== 'signed-out' || started.current) return;
    started.current = true;
    signInAsGuest().catch((error: unknown) => setSession({ status: 'error', message: errorMessage(error) }));
  }, [status, signInAsGuest]);

  // Com sessão: usa a ficha que já existe para este link; senão grava a da conta ou pede (ou reaproveita) o nome.
  useEffect(() => {
    if (!user || (status !== 'guest' && status !== 'signed-in')) return;
    let cancelled = false;
    void (async () => {
      try {
        const snapshot = await getDoc(doc(getFirebase().db, firestorePaths.snapshotGuest(projectId, snapshotId, user.uid)));
        const current = snapshot.data() as ReviewGuestDoc | undefined;
        if (cancelled) return;
        const accountKey = accountGuestKey(user.uid);
        const accountName = memberProfileOf(user).name.slice(0, 80);
        if (current && current.reviewId === reviewId && current.token === token && (!viaAccount || (current.guestKey === accountKey && current.name === accountName))) {
          if (!viaAccount) cacheName(current.name);
          setSession({ status: 'ready', identity: { name: current.name, key: current.guestKey, viaAccount } });
          return;
        }
        if (viaAccount) return await saveRef.current(accountName, accountKey, true);
        const cached = readCachedName();
        if (cached) await saveRef.current(cached.trim().replace(/\s+/g, ' ').slice(0, 80), guestKeyOf(cached), false);
        else setSession({ status: 'need-name', suggestion: '' });
      } catch (error) {
        if (!cancelled) setSession({ status: 'error', message: errorMessage(error) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, status, viaAccount, projectId, reviewId, snapshotId, token]);

  /** Trocar o nome (outra pessoa usando o mesmo navegador, ou nome digitado errado). Só para quem entrou sem conta. */
  const changeName = useCallback(() => setSession({ status: 'need-name', suggestion: readCachedName() }), []);

  return { session, register, changeName };
}
