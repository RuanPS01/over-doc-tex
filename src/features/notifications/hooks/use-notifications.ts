import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type QuerySnapshot,
} from 'firebase/firestore';
import { useEffect, useMemo } from 'react';
import { firestorePaths } from '@shared/firestore/paths';
import type { NotificationDoc, NotificationType } from '@shared/firestore/types';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { getFirebase, isFirebaseConfigured } from '@/lib/firebase/app';

export interface NotificationItem extends Omit<NotificationDoc, 'createdAt'> {
  id: string;
  createdAt: Date | null;
}

const MAX_SHOWN = 30;
const notificationsKey = (uid: string) => ['notifications', uid] as const;

function notificationsQuery(uid: string) {
  return query(collection(getFirebase().db, firestorePaths.notifications(uid)), orderBy('createdAt', 'desc'), limit(MAX_SHOWN));
}

function fromSnapshot(snapshot: QuerySnapshot): NotificationItem[] {
  return snapshot.docs.map((item) => {
    const data = item.data({ serverTimestamps: 'estimate' }) as NotificationDoc;
    return { ...data, id: item.id, createdAt: data.createdAt?.toDate() ?? null };
  });
}

/** Notificações do usuário (as 30 mais recentes), em tempo real, com marcar como lida. */
export function useNotifications() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const isActive = isFirebaseConfigured && uid !== null;

  useEffect(() => {
    if (!isActive) return;
    return onSnapshot(
      notificationsQuery(uid!),
      (snapshot) => queryClient.setQueryData(notificationsKey(uid!), fromSnapshot(snapshot)),
      () => undefined,
    );
  }, [uid, isActive, queryClient]);

  const result = useQuery({
    queryKey: notificationsKey(uid ?? ''),
    enabled: isActive,
    queryFn: async () => fromSnapshot(await getDocs(notificationsQuery(uid!))),
    staleTime: Number.POSITIVE_INFINITY,
  });

  const actions = useMemo(
    () => ({
      markRead: (id: string) => uid && updateDoc(doc(getFirebase().db, firestorePaths.notification(uid, id)), { read: true }),
      markAllRead: async (items: readonly NotificationItem[]) => {
        if (!uid) return;
        const batch = writeBatch(getFirebase().db);
        for (const item of items.filter((entry) => !entry.read)) batch.update(doc(getFirebase().db, firestorePaths.notification(uid, item.id)), { read: true });
        await batch.commit();
      },
    }),
    [uid],
  );

  const items = result.data ?? [];
  return { items, unread: items.filter((item) => !item.read).length, ...actions };
}

export interface NotificationPayload {
  type: NotificationType;
  projectId: string;
  reviewId: string | null;
  threadId: string | null;
  title: string;
  body: string;
}

/**
 * Grava a notificação para cada destinatário (sem repetir e sem notificar
 * quem agiu). As regras aceitam porque quem age é membro do projeto ou o
 * revisor da revisão citada. Melhor esforço: falhar aqui não desfaz a ação.
 */
export async function sendNotifications(recipients: ReadonlyArray<string | null | undefined>, payload: NotificationPayload): Promise<void> {
  const { db, auth } = getFirebase();
  const actorId = auth.currentUser?.uid;
  if (!actorId) return;
  const targets = [...new Set(recipients.filter((uid): uid is string => Boolean(uid) && uid !== actorId))];
  await Promise.all(
    targets.map((uid) =>
      setDoc(doc(collection(db, firestorePaths.notifications(uid))), {
        ...payload,
        body: payload.body.slice(0, 300),
        actorId,
        read: false,
        createdAt: serverTimestamp(),
      }).catch(() => undefined),
    ),
  );
}
