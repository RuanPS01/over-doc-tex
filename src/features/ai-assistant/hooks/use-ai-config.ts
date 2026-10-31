import { deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { firestorePaths } from '@shared/firestore/paths';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { localAiConfigStorage } from '@/lib/ai/local-config-storage';
import { AiConfigSchema, type AiConfig } from '@/lib/ai/schemas';
import { getFirebase, isFirebaseConfigured } from '@/lib/firebase/app';

export type AiConfigStorage = 'account' | 'browser';

/**
 * Configuração da IA do usuário. Com login, fica na conta (documento privado
 * no Firestore, sincronizado entre dispositivos); sem login, neste navegador.
 */
export function useAiConfig() {
  const { user } = useAuth();
  const local = useSyncExternalStore(localAiConfigStorage.subscribe, localAiConfigStorage.get, () => null);
  const [remote, setRemote] = useState<{ uid: string; config: AiConfig | null } | null>(null);
  const uid = isFirebaseConfigured ? (user?.uid ?? null) : null;

  useEffect(() => {
    if (!uid) return;
    return onSnapshot(doc(getFirebase().db, firestorePaths.userAiConfig(uid)), (snapshot) => {
      const parsed = AiConfigSchema.safeParse(snapshot.data());
      setRemote({ uid, config: parsed.success ? parsed.data : null });
    });
  }, [uid]);

  const storage: AiConfigStorage = uid ? 'account' : 'browser';
  const config = uid ? (remote?.uid === uid ? remote.config : null) : local;
  const isLoading = uid !== null && remote?.uid !== uid;

  const save = useCallback(
    async (next: AiConfig) => {
      const parsed = AiConfigSchema.parse(next);
      if (!uid) return localAiConfigStorage.set(parsed);
      await setDoc(doc(getFirebase().db, firestorePaths.userAiConfig(uid)), {
        ...parsed,
        updatedAt: serverTimestamp(),
      });
    },
    [uid],
  );

  const clear = useCallback(async () => {
    if (!uid) return localAiConfigStorage.set(null);
    await deleteDoc(doc(getFirebase().db, firestorePaths.userAiConfig(uid)));
  }, [uid]);

  return { config, isLoading, storage, save, clear };
}
