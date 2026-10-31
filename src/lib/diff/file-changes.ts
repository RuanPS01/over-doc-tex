import { diffStats, diffText, type DiffSegment, type DiffStats } from './word-diff';

/** Um lado da comparação: texto dos arquivos de texto, hash dos binários. */
export type TreeEntry = { text: string } | { hash: string };

export type FileChangeStatus = 'added' | 'removed' | 'modified';

export interface FileChange {
  path: string;
  status: FileChangeStatus;
  /** Nulo para binários (só se sabe que mudaram). */
  segments: DiffSegment[] | null;
  stats: DiffStats;
}

export interface TreeChanges {
  files: FileChange[];
  totals: DiffStats & { changedFiles: number };
}

const isText = (entry: TreeEntry): entry is { text: string } => 'text' in entry;

/** Arquivos que mudaram entre duas árvores, em ordem de caminho, com o diff por palavra dos textos. */
export function compareTrees(base: ReadonlyMap<string, TreeEntry>, target: ReadonlyMap<string, TreeEntry>): TreeChanges {
  const paths = [...new Set([...base.keys(), ...target.keys()])].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const files: FileChange[] = [];
  for (const path of paths) {
    const before = base.get(path);
    const after = target.get(path);
    if (before && after) {
      if (isText(before) && isText(after)) {
        if (before.text === after.text) continue;
        const segments = diffText(before.text, after.text);
        files.push({ path, status: 'modified', segments, stats: diffStats(segments) });
      } else if (!isText(before) && !isText(after)) {
        if (before.hash === after.hash) continue;
        files.push({ path, status: 'modified', segments: null, stats: { insertedWords: 0, deletedWords: 0 } });
      } else {
        files.push({ path, status: 'modified', segments: null, stats: { insertedWords: 0, deletedWords: 0 } });
      }
    } else {
      const entry = (after ?? before)!;
      const status: FileChangeStatus = after ? 'added' : 'removed';
      const segments = isText(entry) ? [{ op: after ? ('insert' as const) : ('delete' as const), text: entry.text }] : null;
      files.push({ path, status, segments, stats: segments ? diffStats(segments) : { insertedWords: 0, deletedWords: 0 } });
    }
  }
  const totals = files.reduce(
    (sum, file) => ({
      insertedWords: sum.insertedWords + file.stats.insertedWords,
      deletedWords: sum.deletedWords + file.stats.deletedWords,
      changedFiles: sum.changedFiles + 1,
    }),
    { insertedWords: 0, deletedWords: 0, changedFiles: 0 },
  );
  return { files, totals };
}
