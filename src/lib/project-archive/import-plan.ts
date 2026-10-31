import { joinPath, uniquePath } from './archive-paths';

export interface ImportEntry {
  /** Caminho relativo já normalizado (ver normalizeArchivePath). */
  path: string;
  data: Uint8Array;
}

/** O que fazer quando o arquivo importado tem o mesmo caminho de um existente. */
export type ConflictPolicy = 'overwrite' | 'keep-both';

export interface ImportOperation {
  entry: ImportEntry;
  targetPath: string;
  /** `overwrite` substitui o conteúdo do arquivo existente no mesmo caminho. */
  action: 'create' | 'overwrite';
  /** Verdadeiro quando o nome ganhou sufixo (-1, -2...) para não sobrescrever. */
  renamed: boolean;
}

export interface ImportPlan {
  operations: ImportOperation[];
  createCount: number;
  overwriteCount: number;
  renamedCount: number;
}

/**
 * Pasta raiz comum a todas as entradas ("projeto/" num zip exportado por
 * outra ferramenta), para oferecer importar só o conteúdo dela.
 */
export function singleRootFolder(entries: readonly ImportEntry[]): string | null {
  const roots = new Set(entries.map((entry) => (entry.path.includes('/') ? entry.path.split('/')[0] : '')));
  const [root] = [...roots];
  return roots.size === 1 && root ? root : null;
}

export function stripRootFolder(entries: readonly ImportEntry[], root: string): ImportEntry[] {
  return entries.map((entry) => ({ ...entry, path: entry.path.slice(root.length + 1) }));
}

/**
 * Decide o caminho final de cada arquivo importado, sem tocar em nada:
 * a interface mostra o plano antes de o usuário confirmar.
 */
export function planImport(input: {
  existingPaths: Iterable<string>;
  entries: readonly ImportEntry[];
  targetFolder: string;
  conflict: ConflictPolicy;
}): ImportPlan {
  const existing = new Set(input.existingPaths);
  const taken = new Set(existing);
  const operations: ImportOperation[] = [];

  for (const entry of input.entries) {
    const wanted = joinPath(input.targetFolder, entry.path);
    const collides = taken.has(wanted);
    if (collides && input.conflict === 'overwrite' && existing.has(wanted)) {
      operations.push({ entry, targetPath: wanted, action: 'overwrite', renamed: false });
      // Dois itens do mesmo lote com o mesmo caminho: o segundo não pode sobrescrever o primeiro.
      existing.delete(wanted);
      continue;
    }
    const targetPath = uniquePath(wanted, taken);
    taken.add(targetPath);
    operations.push({ entry, targetPath, action: 'create', renamed: targetPath !== wanted });
  }

  return {
    operations,
    createCount: operations.filter((operation) => operation.action === 'create').length,
    overwriteCount: operations.filter((operation) => operation.action === 'overwrite').length,
    renamedCount: operations.filter((operation) => operation.renamed).length,
  };
}
