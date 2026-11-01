import { sendSignInLinkToEmail } from 'firebase/auth';
import { arrayUnion, collection, doc, onSnapshot, orderBy, query, serverTimestamp, writeBatch } from 'firebase/firestore';
import { useCallback, useEffect, useState } from 'react';
import { firestorePaths } from '@shared/firestore/paths';
import type { ReviewAccess } from '@shared/firestore/types';
import { emailLinkUrl } from '@/lib/email';
import { getFirebase } from '@/lib/firebase/app';
import { t } from '@/lib/i18n';
import { newLinkToken, reviewPath, type ReviewSummary } from '../model/review';

/**
 * "Envio da revisão" (dono e editores): tipo de acesso, link sem conta e
 * e-mails convidados. Cada gravação segue o formato das regras: a revisão só
 * muda access, reviewerEmails e lastActivityAt; o código do link é o id do
 * documento em reviews/{id}/links; cada e-mail novo ganha a concessão na versão.
 */
export function useReviewSharing(review: ReviewSummary, enabled: boolean) {
  const [tokens, setTokens] = useState<string[] | null>(null);
  const projectId = review.projectId;
  const reviewId = review.id;

  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(
      query(collection(getFirebase().db, firestorePaths.reviewLinks(projectId, reviewId)), orderBy('createdAt', 'desc')),
      (snapshot) => setTokens(snapshot.docs.map((item) => item.id)),
      () => setTokens([]),
    );
  }, [enabled, projectId, reviewId]);

  const uid = () => {
    const current = getFirebase().auth.currentUser;
    if (!current) throw new Error(t('Entre na sua conta para mudar o envio da revisão.'));
    return current.uid;
  };

  /** Troca o acesso; ao abrir pelo link sem código ainda, cria o primeiro no mesmo lote. */
  const setAccess = useCallback(
    async (access: ReviewAccess) => {
      const { db } = getFirebase();
      const batch = writeBatch(db);
      batch.update(doc(db, firestorePaths.review(projectId, reviewId)), { access, lastActivityAt: serverTimestamp() });
      if (access === 'link' && (tokens?.length ?? 0) === 0) {
        batch.set(doc(db, firestorePaths.reviewLink(projectId, reviewId, newLinkToken())), { createdBy: uid(), createdAt: serverTimestamp() });
      }
      await batch.commit();
    },
    [projectId, reviewId, tokens],
  );

  /** Link novo: os códigos anteriores saem no mesmo lote, e quem tinha o link antigo perde o acesso. */
  const regenerateLink = useCallback(async () => {
    const { db } = getFirebase();
    const batch = writeBatch(db);
    for (const token of tokens ?? []) batch.delete(doc(db, firestorePaths.reviewLink(projectId, reviewId, token)));
    batch.set(doc(db, firestorePaths.reviewLink(projectId, reviewId, newLinkToken())), { createdBy: uid(), createdAt: serverTimestamp() });
    await batch.commit();
  }, [projectId, reviewId, tokens]);

  /** Convida mais e-mails para esta revisão e manda o link de acesso a cada um (melhor esforço). */
  const addEmails = useCallback(
    async (emails: readonly string[]): Promise<{ added: number; emailed: number }> => {
      const fresh = emails.filter((email) => !review.reviewerEmails.includes(email));
      if (fresh.length === 0) return { added: 0, emailed: 0 };
      const { db, auth } = getFirebase();
      const by = uid();
      const batch = writeBatch(db);
      for (const email of fresh) {
        batch.set(
          doc(db, firestorePaths.snapshotGrant(projectId, review.snapshotId, email)),
          {
            documentIds: arrayUnion(...review.grantedDocumentIds),
            reviewIds: arrayUnion(reviewId),
            grantedBy: by,
            grantedAt: serverTimestamp(),
            expiresAt: null,
          },
          { merge: true },
        );
      }
      batch.update(doc(db, firestorePaths.review(projectId, reviewId)), {
        reviewerEmails: arrayUnion(...review.reviewerEmails, ...fresh),
        lastActivityAt: serverTimestamp(),
      });
      await batch.commit();
      const sent = await Promise.all(
        fresh.map((email) =>
          sendSignInLinkToEmail(auth, email, { url: emailLinkUrl(email, reviewPath(projectId, reviewId)), handleCodeInApp: true }).then(
            () => true,
            () => false,
          ),
        ),
      );
      return { added: fresh.length, emailed: sent.filter(Boolean).length };
    },
    [projectId, reviewId, review.reviewerEmails, review.snapshotId, review.grantedDocumentIds],
  );

  return { token: tokens?.[0] ?? null, isLoadingLinks: enabled && tokens === null, setAccess, regenerateLink, addEmails };
}
