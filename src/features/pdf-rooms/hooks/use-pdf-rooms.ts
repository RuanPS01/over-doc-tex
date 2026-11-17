import { useMemo } from 'react';
import { useProjects, type ProjectSummary } from '@/features/projects/hooks/use-projects';
import { useNextReviewVersion } from '@/features/review/hooks/use-request-review';
import { useReviews } from '@/features/review/hooks/use-reviews';

export type PdfRoomSummary = ProjectSummary;

/** Salas de revisão de PDF avulso do usuário (os projetos `kind: "pdf"`), em tempo real. */
export function usePdfRooms() {
  const query = useProjects();
  const rooms = useMemo(() => query.data?.filter((project) => project.kind === 'pdf') ?? [], [query.data]);
  return { rooms, isPending: query.isPending, isError: query.isError };
}

/** Rodadas da sala, da mais nova para a mais antiga (a primeira é a atual). */
export function usePdfRoomRounds(roomId: string) {
  return useReviews(roomId);
}

/** Números possíveis da próxima versão do PDF (ajuste e principal). */
export function useNextPdfVersion(roomId: string | null, enabled: boolean) {
  return useNextReviewVersion(roomId ?? '', enabled && roomId !== null);
}
