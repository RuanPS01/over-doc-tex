import { sendSignInLinkToEmail } from 'firebase/auth';
import { arrayUnion, collection, doc, getDoc, getDocs, serverTimestamp, writeBatch } from 'firebase/firestore';
import { firestorePaths } from '@shared/firestore/paths';
import type { ProjectDoc, ProjectKind, ReviewAccess, ReviewDoc } from '@shared/firestore/types';
import { emailLinkUrl } from '@/lib/email';
import { getFirebase } from '@/lib/firebase/app';
import { MAX_REVIEWER_EMAILS, newLinkToken, reviewPath } from '../model/review';

export interface OpenReviewRoundInput {
  projectId: string;
  projectName: string;
  /** "pdf" nas salas de PDF avulso (vai denormalizado na revisão). */
  projectKind: ProjectKind;
  /** Versão já congelada que os revisores vão ver. */
  snapshotId: string;
  snapshotLabel: string;
  access: ReviewAccess;
  /** Já validados e em minúsculas; por e-mail, pelo menos um. */
  reviewerEmails: readonly string[];
  title: string;
  description: string;
  /** Documentos que o revisor vê; o principal vem primeiro. */
  documentIds: readonly string[];
  /**
   * Rodada anterior (base de "Ver alterações" e origem das threads abertas):
   * "same-reviewers" é a revisão mais recente com algum dos mesmos revisores (projeto LaTeX);
   * "latest" é a mais recente do projeto (sala de PDF, que é uma conversa só).
   */
  previousRound: 'same-reviewers' | 'latest';
}

export interface OpenedReviewRound {
  reviewId: string;
  number: number;
  reviewerEmails: string[];
  baseSnapshotId: string | null;
  /** Rodada anterior e o status dela quando a nova abriu. */
  previous: { id: string; status: ReviewDoc['status'] } | null;
  /** Código do link sem conta (só no acesso pelo link). */
  linkToken: string | null;
}

/**
 * Abre a revisão de uma versão já congelada num lote só com os grants dos
 * revisores, o código do link (no acesso pelo link) e o contador do projeto,
 * como as regras exigem. Usado por "Solicitar revisão" e pelas salas de PDF.
 */
export async function openReviewRound(input: OpenReviewRoundInput): Promise<OpenedReviewRound> {
  const { db, auth } = getFirebase();
  const uid = auth.currentUser!.uid;
  const emails = [...new Set(input.reviewerEmails)].slice(0, MAX_REVIEWER_EMAILS);
  // O primeiro é o reviewerEmail (as regras conferem o grant dele no lote); os demais vão em reviewerEmails.
  const reviewerEmail = emails[0] ?? '';
  const granted = [...input.documentIds];
  const projectRef = doc(db, firestorePaths.project(input.projectId));
  const project = (await getDoc(projectRef)).data() as ProjectDoc;

  const reviews = (await getDocs(collection(db, firestorePaths.reviews(input.projectId)))).docs
    .map((item) => ({ id: item.id, data: item.data() as ReviewDoc }))
    .sort((a, b) => b.data.number - a.data.number);
  const previous =
    input.previousRound === 'latest'
      ? reviews[0]
      : reviews.find((item) => [item.data.reviewerEmail, ...(item.data.reviewerEmails ?? [])].some((email) => email && emails.includes(email)));

  const number = project.counters.reviews + 1;
  const reviewRef = doc(collection(db, firestorePaths.reviews(input.projectId)));
  const review: Omit<ReviewDoc, 'requestedAt' | 'lastActivityAt'> & { requestedAt: unknown; lastActivityAt: unknown } = {
    number,
    title: input.title,
    description: input.description.trim() || null,
    projectName: input.projectName,
    ...(input.projectKind === 'pdf' ? { projectKind: 'pdf' as const } : {}),
    snapshotId: input.snapshotId,
    snapshotLabel: input.snapshotLabel,
    baseSnapshotId: previous && previous.data.snapshotId !== input.snapshotId ? previous.data.snapshotId : null,
    previousReviewId: previous?.id ?? null,
    requestedBy: uid,
    requestedAt: serverTimestamp(),
    reviewerEmail,
    reviewerEmails: emails,
    access: input.access,
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
      doc(db, firestorePaths.snapshotGrant(input.projectId, input.snapshotId, email)),
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
  const linkToken = input.access === 'link' ? newLinkToken() : null;
  if (linkToken) batch.set(doc(db, firestorePaths.reviewLink(input.projectId, reviewRef.id, linkToken)), { createdBy: uid, createdAt: serverTimestamp() });
  batch.update(projectRef, {
    counters: { snapshots: project.counters.snapshots, reviews: number },
    updatedAt: serverTimestamp(),
  });
  await batch.commit();

  return {
    reviewId: reviewRef.id,
    number,
    reviewerEmails: emails,
    baseSnapshotId: review.baseSnapshotId,
    previous: previous ? { id: previous.id, status: previous.data.status } : null,
    linkToken,
  };
}

/**
 * Cada convidado recebe o próprio link de acesso (melhor esforço: a revisão
 * já está aberta). Devolve quantos e-mails saíram.
 */
export async function sendReviewInvites(projectId: string, reviewId: string, emails: readonly string[]): Promise<number> {
  const { auth } = getFirebase();
  const sent = await Promise.all(
    emails.map((email) =>
      sendSignInLinkToEmail(auth, email, { url: emailLinkUrl(email, reviewPath(projectId, reviewId)), handleCodeInApp: true }).then(
        () => true,
        () => false,
      ),
    ),
  );
  return sent.filter(Boolean).length;
}
