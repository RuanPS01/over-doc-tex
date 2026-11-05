import { sendSignInLinkToEmail } from 'firebase/auth';
import { arrayUnion, collection, doc, getDoc, getDocs, serverTimestamp, writeBatch } from 'firebase/firestore';
import { useCallback } from 'react';
import { firestorePaths } from '@shared/firestore/paths';
import type { ProjectDoc, ReviewAccess, ReviewDoc } from '@shared/firestore/types';
import { useVisualDiff } from '@/features/diff/hooks/use-visual-diff';
import { MAIN_DOCUMENT_ID } from '@/features/projects/model/new-project';
import { useFreezeSnapshot, type FreezeStage } from '@/features/snapshots/hooks/use-freeze-snapshot';
import { useSnapshots } from '@/features/snapshots/hooks/use-snapshots';
import { nextVersion, versionLabel, type VersionBump } from '@/features/snapshots/model/version';
import { emailLinkUrl } from '@/lib/email';
import { getFirebase } from '@/lib/firebase/app';
import { newLinkToken, reviewPath } from '../model/review';
import { useCarryThreads } from './use-carry-threads';

/** Falha de compilação ao congelar a versão da revisão (traz os erros do TeX). */
export { FreezeError } from '@/features/snapshots/hooks/use-freeze-snapshot';

export type RequestStage = FreezeStage | 'opening' | 'diff' | 'carry';

export interface RequestReviewInput {
  /** "email": só os convidados, com login; "link": qualquer pessoa com o link, sem conta. */
  access: ReviewAccess;
  /**
   * E-mails convidados, já validados e em minúsculas (até MAX_REVIEWER_EMAILS). Por e-mail, pelo
   * menos um; pelo link, pode ficar vazio.
   */
  reviewerEmails: readonly string[];
  /** Versão congelada para a revisão: ajuste (1.3) ou principal (2.0). */
  bump: VersionBump;
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
  /** E-mails convidados nesta revisão. */
  reviewerEmails: string[];
  /** Quantos receberam o link de acesso do Firebase (exige "Link de e-mail" ativo no Authentication). */
  emailsSent: number;
  /** Threads abertas da rodada anterior levadas para esta. */
  carriedThreads: number;
  /** Versão revisada (vai no link sem conta). */
  snapshotId: string;
  /** Código do link sem conta (só no acesso pelo link). */
  linkToken: string | null;
}

/** Teto das regras para reviewerEmails (validAccess em firestore.rules). */
export const MAX_REVIEWER_EMAILS = 50;

/**
 * Número da versão que "Solicitar revisão" vai congelar, para o diálogo
 * mostrar antes de enviar: a próxima de ajuste e a próxima principal.
 */
export function useNextReviewVersion(projectId: string, enabled: boolean) {
  const { data: snapshots, isPending } = useSnapshots(projectId, enabled);
  const latest = snapshots?.[0]?.version ?? null;
  return {
    isLoading: enabled && isPending,
    /** Sem versão anterior, a primeira é sempre 1.0 (não há escolha). */
    isFirst: latest === null,
    labels: { minor: versionLabel(nextVersion(latest, 'minor')), major: versionLabel(nextVersion(latest, 'major')) } satisfies Record<VersionBump, string>,
  };
}

/**
 * "Solicitar revisão" (docs/07-fluxos.md, cenário A): cada revisão congela
 * uma versão nova (o projeto como está na tela) e abre a revisão num lote só
 * com os grants dos revisores e o contador do projeto, como as regras exigem.
 */
export function useRequestReview(projectId: string, projectName: string) {
  const freeze = useFreezeSnapshot(projectId, projectName);
  const { betweenVersions } = useVisualDiff(projectId);
  const carryThreads = useCarryThreads(projectId);

  return useCallback(
    async ({ access, reviewerEmails, bump, title, description, documentIds, onStage }: RequestReviewInput): Promise<RequestReviewResult> => {
      const emails = [...new Set(reviewerEmails)].slice(0, MAX_REVIEWER_EMAILS);
      // O primeiro é o reviewerEmail (as regras conferem o grant dele no lote); os demais vão em reviewerEmails.
      const reviewerEmail = emails[0] ?? '';
      const granted = [MAIN_DOCUMENT_ID, ...documentIds.filter((id) => id !== MAIN_DOCUMENT_ID)];
      const frozen = await freeze({ message: title, bump, onStage });

      onStage('opening');
      const { db, auth } = getFirebase();
      const uid = auth.currentUser!.uid;
      const projectRef = doc(db, firestorePaths.project(projectId));
      const project = (await getDoc(projectRef)).data() as ProjectDoc;

      // Rodada anterior: a revisão mais recente com algum dos mesmos revisores. A versão dela é a base
      // de "Ver alterações", e as threads abertas dela vêm junto.
      const reviews = await getDocs(collection(db, firestorePaths.reviews(projectId)));
      const previous = reviews.docs
        .map((item) => ({ id: item.id, data: item.data() as ReviewDoc }))
        .filter((item) => [item.data.reviewerEmail, ...(item.data.reviewerEmails ?? [])].some((email) => email && emails.includes(email)))
        .sort((a, b) => b.data.number - a.data.number)[0];

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
        reviewerEmails: emails,
        access,
        reviewerUid: null,
        reviewerName: null,
        status: 'invited',
        grantedDocumentIds: granted,
        lastActivityAt: serverTimestamp(),
        closedAt: null,
      };

      const batch = writeBatch(db);
      // Um grant por e-mail. merge: o mesmo revisor pode já ter acesso a esta versão por outra revisão.
      for (const email of emails) {
        batch.set(
          doc(db, firestorePaths.snapshotGrant(projectId, frozen.snapshotId, email)),
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

      // Cada convidado recebe o próprio link de acesso (melhor esforço: a revisão já está aberta).
      const sent = await Promise.all(
        emails.map((email) =>
          sendSignInLinkToEmail(auth, email, { url: emailLinkUrl(email, reviewPath(projectId, reviewRef.id)), handleCodeInApp: true }).then(
            () => true,
            () => false,
          ),
        ),
      );
      return {
        reviewId: reviewRef.id,
        number,
        snapshotLabel: frozen.label,
        reviewerEmails: emails,
        emailsSent: sent.filter(Boolean).length,
        carriedThreads,
        snapshotId: frozen.snapshotId,
        linkToken,
      };
    },
    [freeze, betweenVersions, carryThreads, projectId, projectName],
  );
}
