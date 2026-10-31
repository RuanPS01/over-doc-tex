import type { SnapshotDoc, SnapshotFileEntry } from '@shared/firestore/types';

export type VersionNumber = SnapshotDoc['version'];
export type VersionBump = 'minor' | 'major';

/** Primeira versão 1.0; depois 1.1, 1.2... ou a próxima principal (2.0). */
export function nextVersion(latest: VersionNumber | null, bump: VersionBump): VersionNumber {
  if (!latest) return { major: 1, minor: 0 };
  return bump === 'major' ? { major: latest.major + 1, minor: 0 } : { major: latest.major, minor: latest.minor + 1 };
}

export function versionLabel(version: VersionNumber): string {
  return `${version.major}.${version.minor}`;
}

export const MAX_VERSION_MESSAGE = 500;

/** Manifesto em ordem de caminho: a mesma árvore sempre gera o mesmo sourceHash. */
export function sortManifest(entries: readonly SnapshotFileEntry[]): SnapshotFileEntry[] {
  return [...entries].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/** Texto do manifesto que vira o sourceHash (caminho e hash por linha). */
export function manifestText(entries: readonly SnapshotFileEntry[]): string {
  return sortManifest(entries)
    .map((entry) => `${entry.path}\t${entry.hash}\n`)
    .join('');
}

export function countWords(pages: readonly string[]): number {
  return pages.reduce((total, page) => total + (page.match(/[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu)?.length ?? 0), 0);
}

/** Conteúdo do arquivo .pages da versão. */
export interface PageTextFile {
  pages: string[];
}

export function parsePageTextFile(data: Uint8Array): string[] {
  const parsed = JSON.parse(new TextDecoder().decode(data)) as Partial<PageTextFile>;
  return Array.isArray(parsed.pages) ? parsed.pages.filter((page): page is string => typeof page === 'string') : [];
}
