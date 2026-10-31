import { useCallback } from 'react';
import { useProjectSources } from '@/features/editor/hooks/use-project-sources';
import { useSnapshotFiles } from '@/features/snapshots/hooks/use-snapshot-files';
import { useSnapshots, type SnapshotSummary } from '@/features/snapshots/hooks/use-snapshots';
import { compareTrees, type TreeChanges, type TreeEntry } from '@/lib/diff/file-changes';
import { isTextPath } from '@/lib/project-archive/archive-paths';

/** Lado da comparação: o rascunho como está na tela ou uma versão congelada. */
export type ComparedSide = { kind: 'draft' } | { kind: 'snapshot'; snapshot: SnapshotSummary };

/**
 * Compara o código de duas árvores (versão com versão ou versão com o
 * rascunho). Só membros chegam aqui: o código das versões vem dos blobs.
 */
export function useTreeChanges(projectId: string) {
  const collectSources = useProjectSources(projectId);
  const { readSources } = useSnapshotFiles(projectId);

  const readSide = useCallback(
    async (side: ComparedSide): Promise<Map<string, TreeEntry>> => {
      const tree = new Map<string, TreeEntry>();
      if (side.kind === 'draft') {
        const { texts, binaries } = await collectSources(null);
        for (const file of texts) tree.set(file.path, { text: file.content });
        for (const [path, binary] of binaries) tree.set(path, { hash: binary.hash });
        return tree;
      }
      const textEntries = side.snapshot.files.filter((file) => isTextPath(file.path));
      const contents = await readSources(textEntries);
      const decoder = new TextDecoder();
      for (const file of side.snapshot.files) {
        const data = contents.get(file.path);
        tree.set(file.path, data ? { text: decoder.decode(data) } : { hash: file.hash });
      }
      return tree;
    },
    [collectSources, readSources],
  );

  return useCallback(
    async (base: ComparedSide, target: ComparedSide): Promise<TreeChanges> => {
      const [before, after] = await Promise.all([readSide(base), readSide(target)]);
      return compareTrees(before, after);
    },
    [readSide],
  );
}

/** Versões disponíveis para comparar e a função que compara, para o diálogo "Ver alterações". */
export function useVersionComparison(projectId: string, enabled: boolean) {
  const snapshots = useSnapshots(projectId, enabled);
  const compare = useTreeChanges(projectId);
  return { snapshots: snapshots.data ?? [], isPending: snapshots.isPending, compare };
}
