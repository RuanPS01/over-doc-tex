import { useCallback } from 'react';
import type { ReviewAccess } from '@shared/firestore/types';
import { useVisualDiff } from '@/features/diff/hooks/use-visual-diff';
import { MAIN_DOCUMENT_ID } from '@/features/projects/model/new-project';
import { useFreezeSnapshot, type FreezeStage } from '@/features/snapshots/hooks/use-freeze-snapshot';
import { useSnapshots } from '@/features/snapshots/hooks/use-snapshots';
import { nextVersion, versionLabel, type VersionBump } from '@/features/snapshots/model/version';
import { openReviewRound, sendReviewInvites } from './open-review-round';
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

export { MAX_REVIEWER_EMAILS } from '../model/review';

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
      const granted = [MAIN_DOCUMENT_ID, ...documentIds.filter((id) => id !== MAIN_DOCUMENT_ID)];
      const frozen = await freeze({ message: title, bump, onStage });

      onStage('opening');
      // Rodada anterior: a revisão mais recente com algum dos mesmos revisores. A versão dela é a base
      // de "Ver alterações", e as threads abertas dela vêm junto.
      const round = await openReviewRound({
        projectId,
        projectName,
        projectKind: 'latex',
        snapshotId: frozen.snapshotId,
        snapshotLabel: frozen.label,
        access,
        reviewerEmails,
        title,
        description,
        documentIds: granted,
        previousRound: 'same-reviewers',
      });

      // Rodada seguinte: o diff em PDF já fica guardado para o revisor (que não lê o código).
      if (round.baseSnapshotId) {
        onStage('diff');
        for (const documentId of granted) {
          await betweenVersions(round.baseSnapshotId, frozen.snapshotId, documentId, true).catch(() => undefined);
        }
      }

      // Threads ainda abertas da rodada anterior do mesmo revisor vêm junto, reancoradas na versão nova.
      let carriedThreads = 0;
      if (round.previous) {
        onStage('carry');
        carriedThreads = await carryThreads(round.previous.id, { id: round.reviewId, snapshotId: frozen.snapshotId, grantedDocumentIds: granted }).catch(() => 0);
      }

      const emailsSent = await sendReviewInvites(projectId, round.reviewId, round.reviewerEmails);
      return {
        reviewId: round.reviewId,
        number: round.number,
        snapshotLabel: frozen.label,
        reviewerEmails: round.reviewerEmails,
        emailsSent,
        carriedThreads,
        snapshotId: frozen.snapshotId,
        linkToken: round.linkToken,
      };
    },
    [freeze, betweenVersions, carryThreads, projectId, projectName],
  );
}
