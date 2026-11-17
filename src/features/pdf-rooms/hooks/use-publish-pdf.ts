import { collection, doc, getDoc, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { useCallback } from 'react';
import { firestorePaths, snapshotFileName } from '@shared/firestore/paths';
import type { ProjectDoc, ReviewAccess, SnapshotDoc } from '@shared/firestore/types';
import { memberProfileOf } from '@/features/projects/model/new-project';
import { openReviewRound, sendReviewInvites } from '@/features/review/hooks/open-review-round';
import type { RequestReviewResult } from '@/features/review/hooks/use-request-review';
import { useCarryThreads } from '@/features/review/hooks/use-carry-threads';
import { nextVersion, type PageTextFile, type VersionBump } from '@/features/snapshots/model/version';
import { getFirebase } from '@/lib/firebase/app';
import { writeStoredFile } from '@/lib/firebase/stored-files';
import { t } from '@/lib/i18n';
import { extractPageTexts } from '@/lib/pdf/page-text';
import { sha256Hex } from '@/lib/stored-files/chunks';
import { MAX_PDF_BYTES, PDF_ROOM_DOCUMENT_ID, buildPdfRoom, buildPdfSnapshot, isPdfData } from '../model/pdf-room';

export type PublishPdfStage = 'reading' | 'uploading' | 'opening' | 'carry';

export interface PublishPdfInput {
  /** Nome da sala (projeto); numa sala existente, o nome atual dela. */
  roomName: string;
  file: { name: string; data: Uint8Array };
  /** Ajuste (1.1) ou principal (2.0); a primeira versão é sempre 1.0. */
  bump: VersionBump;
  access: ReviewAccess;
  reviewerEmails: readonly string[];
  title: string;
  description: string;
  /** Nova versão: encerra a rodada anterior (as threads abertas dela vêm para a nova). */
  closePrevious: boolean;
  onStage: (stage: PublishPdfStage) => void;
}

export interface PublishPdfResult extends RequestReviewResult {
  roomId: string;
}

/** Falha com uma mensagem pronta para a tela. */
export class PublishPdfError extends Error {}

/** Lê o texto de cada página (âncora dos comentários e diff de texto entre versões). */
async function readPdfPages(data: Uint8Array): Promise<string[]> {
  if (data.byteLength > MAX_PDF_BYTES) throw new PublishPdfError(t('O PDF passa de 50 MB, o limite de cada versão.'));
  if (!isPdfData(data)) throw new PublishPdfError(t('O arquivo escolhido não é um PDF.'));
  let pages: string[];
  try {
    pages = await extractPageTexts(data);
  } catch {
    throw new PublishPdfError(t('Não foi possível ler o PDF. Ele pode estar corrompido ou protegido por senha.'));
  }
  if (pages.length === 0) throw new PublishPdfError(t('O PDF não tem páginas.'));
  return pages;
}

/**
 * Publica um PDF numa sala de revisão de PDF avulso (docs/07-fluxos.md,
 * cenário E). Sem `roomId`, cria a sala (projeto `kind: "pdf"`). Em seguida,
 * como no congelamento de um projeto LaTeX: grava o PDF e o texto por página
 * da versão, o snapshot com o contador do projeto e, por fim, abre a rodada de
 * revisão (grants, link e contador) e manda os convites. Numa sala existente,
 * as threads abertas da rodada anterior vêm para a nova, reancoradas.
 */
export function usePublishPdf(roomId: string | null) {
  const carryThreads = useCarryThreads(roomId ?? '');

  return useCallback(
    async (input: PublishPdfInput): Promise<PublishPdfResult> => {
      const { db, auth } = getFirebase();
      const user = auth.currentUser;
      if (!user) throw new PublishPdfError(t('Entre na sua conta para revisar PDFs.'));
      const uid = user.uid;

      input.onStage('reading');
      const pages = await readPdfPages(input.file.data);
      const pdfSha256 = await sha256Hex(input.file.data);

      input.onStage('uploading');
      let projectId = roomId;
      if (!projectId) {
        const roomRef = doc(collection(db, firestorePaths.projects()));
        await setDoc(roomRef, buildPdfRoom({ uid, profile: memberProfileOf(user), name: input.roomName, now: serverTimestamp() }));
        projectId = roomRef.id;
      }
      const projectRef = doc(db, firestorePaths.project(projectId));
      const project = (await getDoc(projectRef)).data() as ProjectDoc | undefined;
      if (!project) throw new PublishPdfError(t('Sala de revisão não encontrada.'));
      const latest = project.latestSnapshotId
        ? ((await getDoc(doc(db, firestorePaths.snapshot(projectId, project.latestSnapshotId)))).data() as SnapshotDoc | undefined)
        : undefined;

      const snapshotRef = doc(collection(db, firestorePaths.snapshots(projectId)));
      const fileOf = (kind: 'pdf' | 'pages') => firestorePaths.snapshotFile(projectId, snapshotRef.id, snapshotFileName(PDF_ROOM_DOCUMENT_ID, kind));
      const pageFile: PageTextFile = { pages };
      await writeStoredFile(db, fileOf('pdf'), input.file.data, { contentType: 'application/pdf', uid, sha256: pdfSha256 });
      await writeStoredFile(db, fileOf('pages'), new TextEncoder().encode(JSON.stringify(pageFile)), { contentType: 'application/json', uid });

      const sequence = project.counters.snapshots + 1;
      const snapshot = buildPdfSnapshot({
        uid,
        fileName: input.file.name,
        version: nextVersion(latest?.version ?? null, input.bump),
        sequence,
        parentSnapshotId: project.latestSnapshotId,
        message: input.title,
        pdfSha256,
        pdfPath: fileOf('pdf'),
        pageTextPath: fileOf('pages'),
        pages,
        now: serverTimestamp(),
      });
      const batch = writeBatch(db);
      batch.set(snapshotRef, snapshot);
      batch.update(projectRef, {
        counters: { snapshots: sequence, reviews: project.counters.reviews },
        latestSnapshotId: snapshotRef.id,
        updatedAt: serverTimestamp(),
      });
      try {
        await batch.commit();
      } catch (error) {
        if ((error as { code?: string }).code === 'permission-denied') {
          throw new PublishPdfError(t('Sem permissão para enviar, ou outra versão foi enviada agora. Tente de novo.'));
        }
        throw error;
      }

      input.onStage('opening');
      const round = await openReviewRound({
        projectId,
        projectName: project.name,
        projectKind: 'pdf',
        snapshotId: snapshotRef.id,
        snapshotLabel: snapshot.label,
        access: input.access,
        reviewerEmails: input.reviewerEmails,
        title: input.title,
        description: input.description,
        documentIds: [PDF_ROOM_DOCUMENT_ID],
        previousRound: 'latest',
      });

      let carriedThreads = 0;
      if (round.previous && roomId) {
        input.onStage('carry');
        carriedThreads = await carryThreads(round.previous.id, { id: round.reviewId, snapshotId: snapshotRef.id, grantedDocumentIds: [PDF_ROOM_DOCUMENT_ID] }).catch(() => 0);
        if (input.closePrevious && round.previous.status !== 'closed') {
          // Melhor esforço: a rodada nova já está aberta.
          await updateDoc(doc(db, firestorePaths.review(projectId, round.previous.id)), {
            status: 'closed',
            closedAt: serverTimestamp(),
            lastActivityAt: serverTimestamp(),
          }).catch(() => undefined);
        }
      }

      const emailsSent = await sendReviewInvites(projectId, round.reviewId, round.reviewerEmails);
      return {
        roomId: projectId,
        reviewId: round.reviewId,
        number: round.number,
        snapshotLabel: snapshot.label,
        reviewerEmails: round.reviewerEmails,
        emailsSent,
        carriedThreads,
        snapshotId: snapshotRef.id,
        linkToken: round.linkToken,
      };
    },
    [roomId, carryThreads],
  );
}
