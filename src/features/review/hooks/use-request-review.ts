import { sendSignInLinkToEmail } from 'firebase/auth';
import { arrayUnion, collection, doc, getDoc, getDocs, serverTimestamp, writeBatch } from 'firebase/firestore';
import { useCallback } from 'react';
import { firestorePaths } from '@shared/firestore/paths';
import type { ProjectDoc, ReviewAccess, ReviewDoc } from '@shared/firestore/types';
import { useVisualDiff } from '@/features/diff/hooks/use-visual-diff';
import { MAIN_DOCUMENT_ID } from '@/features/projects/model/new-project';
import { useFreezeSnapshot, type FreezeStage } from '@/features/snapshots/hooks/use-freeze-snapshot';
import { emailLinkUrl } from '@/lib/email';
import { getFirebase } from '@/lib/firebase/app';
import { newLinkToken, reviewPath } from '../model/review';
import { useCarryThreads } from './use-carry-threads';

/** Falha de compilação ao congelar a versão da revisão (traz os erros do TeX). */
export { FreezeError } from '@/features/snapshots/hooks/use-freeze-snapshot';

export type RequestStage = FreezeStage | 'opening' | 'diff' | 'carry';

export interface RequestReviewInput {
  /** "email": só o convidado, com login; "link": qualquer pessoa com o link, sem conta. */
  access: ReviewAccess;
  /** Obrigatório por e-mail; opcional pelo link (vazio quando ninguém é convidado por e-mail). */
  reviewerEmail: string;
  title: string;
  description: string;
  /** Documentos que o revisor vê; o principal sempre entra. */
  documentIds: readonly string[];
  onStage: (stage: RequestStage) => void;
}

export interface RequestReviewResult {
  reviewId: string;
  number: number;
  snapshotLabel: string;
  /** Versão congelada agora (falso quando o código era igual ao da última). */
  frozeNewVersion: boolean;
  /** O Firebase enviou o link de acesso ao revisor (exige "Link de e-mail" ativo no Authentication). */
  emailSent: boolean;
  /** Threads abertas da rodada anterior levadas para esta. */
  carriedThreads: number;
  /** Versão revisada (vai no link sem conta). */
  snapshotId: string;
  /** Código do link sem conta (só no acesso pelo link). */
  linkToken: string | null;
}

/**
 * "Solicitar revisão" (docs/07-fluxos.md, cenário A): congela a versão se o
 * código mudou desde a última e abre a revisão num lote só com o grant do
 * revisor e o contador do projeto, como as regras exigem.
 */
export function useRequestReview(projectId: string, projectName: string) {
  const freeze = useFreezeSnapshot(projectId, projectName);
  const { betweenVersions } = useVisualDiff(projectId);
  const carryThreads = useCarryThreads(projectId);

  return useCallback(
    async ({ access, reviewerEmail, title, description, documentIds, onStage }: RequestReviewInput): Promise<RequestReviewResult> => {
      const granted = [MAIN_DOCUMENT_ID, ...documentIds.filter((id) => id !== MAIN_DOCUMENT_ID)];
      const frozen = await freeze({ message: title, bump: 'minor', reuseIfUnchanged: true, requiredDocumentIds: granted, onStage });

      onStage('opening');
      const { db, auth } = getFirebase();
      const uid = auth.currentUser!.uid;
      const projectRef = doc(db, firestorePaths.project(projectId));
      const project = (await getDoc(projectRef)).data() as ProjectDoc;

      // Rodada anterior do mesmo revisor: a versão dela é a base de "Ver alterações".
      const reviews = await getDocs(collection(db, firestorePaths.reviews(projectId)));
      const previous = reviewerEmail
        ? reviews.docs
            .map((item) => ({ id: item.id, data: item.data() as ReviewDoc }))
            .filter((item) => item.data.reviewerEmail === reviewerEmail)
            .sort((a, b) => b.data.number - a.data.number)[0]
        : undefined;

      const number = project.counters.reviews + 1;
      const reviewRef = doc(collection(db, firestorePaths.reviews(projectId)));
      const review: Omit<ReviewDoc, 'requestedAt' | 'lastActivityAt'> & { requestedAt: unknown; lastActivityAt: unknown } = {
        number,
        title,
        description: description.trim() || null,
        projectName,
        snapshotId: frozen.snapshotId,
        snapshotLabel: frozen.label,
        baseSnapshotId: previous && previous.data.snapshotId !== frozen.snapshotId ? previous.data.snapshotId : null,
        previousReviewId: previous?.id ?? null,
        requestedBy: uid,
        requestedAt: serverTimestamp(),
        reviewerEmail,
        reviewerEmails: reviewerEmail ? [reviewerEmail] : [],
        access,
        reviewerUid: null,
        reviewerName: null,
        status: 'invited',
        grantedDocumentIds: granted,
        lastActivityAt: serverTimestamp(),
        closedAt: null,
      };

      const batch = writeBatch(db);
      // merge: o mesmo revisor pode já ter acesso a esta versão por outra revisão.
      if (reviewerEmail) {
        batch.set(
          doc(db, firestorePaths.snapshotGrant(projectId, frozen.snapshotId, reviewerEmail)),
          {
            documentIds: arrayUnion(...granted),
            reviewIds: arrayUnion(reviewRef.id),
            grantedBy: uid,
            grantedAt: serverTimestamp(),
            expiresAt: null,
          },
          { merge: true },
        );
      }
      batch.set(reviewRef, review);
      // Pelo link: o código nasce junto com a revisão (o id do documento é o código).
      const linkToken = access === 'link' ? newLinkToken() : null;
      if (linkToken) batch.set(doc(db, firestorePaths.reviewLink(projectId, reviewRef.id, linkToken)), { createdBy: uid, createdAt: serverTimestamp() });
      batch.update(projectRef, {
        counters: { snapshots: project.counters.snapshots, reviews: number },
        updatedAt: serverTimestamp(),
      });
      await batch.commit();

      // Rodada seguinte: o diff em PDF já fica guardado para o revisor (que não lê o código).
      if (review.baseSnapshotId) {
        onStage('diff');
        for (const documentId of granted) {
          await betweenVersions(review.baseSnapshotId, frozen.snapshotId, documentId, true).catch(() => undefined);
        }
      }

      // Threads ainda abertas da rodada anterior do mesmo revisor vêm junto, reancoradas na versão nova.
      let carriedThreads = 0;
      if (review.previousReviewId) {
        onStage('carry');
        carriedThreads = await carryThreads(review.previousReviewId, { id: reviewRef.id, snapshotId: frozen.snapshotId, grantedDocumentIds: granted }).catch(() => 0);
      }

      const emailSent = reviewerEmail
        ? await sendSignInLinkToEmail(auth, reviewerEmail, {
            url: emailLinkUrl(reviewerEmail, reviewPath(projectId, reviewRef.id)),
            handleCodeInApp: true,
          }).then(
            () => true,
            () => false,
          )
        : false;
      return {
        reviewId: reviewRef.id,
        number,
        snapshotLabel: frozen.label,
        frozeNewVersion: !frozen.reused,
        emailSent,
        carriedThreads,
        snapshotId: frozen.snapshotId,
        linkToken,
      };
    },
    [freeze, betweenVersions, carryThreads, projectId, projectName],
  );
}
