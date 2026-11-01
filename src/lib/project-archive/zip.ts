import { unzipSync, zipSync, type Zippable } from 'fflate';
import { t } from '@/lib/i18n';
import { normalizeArchivePath } from './archive-paths';
import type { ImportEntry } from './import-plan';

/**
 * Limites de importação: protegem a aba de travar e a cota do Firestore, onde
 * os binários ficam (1 GiB no plano gratuito, somando todos os dados).
 */
export const IMPORT_LIMITS = {
  maxFiles: 2_000,
  maxTotalBytes: 100 * 1024 * 1024,
  /** Igual ao teto do blob em firestore.rules (26214400 bytes). */
  maxFileBytes: 25 * 1024 * 1024,
} as const;

export class ImportLimitError extends Error {}

export interface SkippedEntry {
  path: string;
  reason: string;
}

function formatMb(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

/**
 * Lê um zip. Os limites são conferidos pelo tamanho declarado de cada entrada
 * ANTES de descompactar (um zip pequeno pode se expandir para gigabytes) e de
 * novo pelo tamanho real depois.
 */
export function readZip(data: Uint8Array): { entries: ImportEntry[]; skipped: SkippedEntry[] } {
  const skipped: SkippedEntry[] = [];
  let declaredTotal = 0;
  let accepted = 0;

  const files = unzipSync(data, {
    filter: (file) => {
      if (file.name.endsWith('/')) return false;
      const path = normalizeArchivePath(file.name);
      if (!path) {
        skipped.push({ path: file.name, reason: t('Caminho inválido ou arquivo de sistema') });
        return false;
      }
      if (file.originalSize > IMPORT_LIMITS.maxFileBytes) {
        skipped.push({ path, reason: t('Maior que {size}', { size: formatMb(IMPORT_LIMITS.maxFileBytes) }) });
        return false;
      }
      declaredTotal += file.originalSize;
      accepted++;
      if (accepted > IMPORT_LIMITS.maxFiles) throw new ImportLimitError(t('O zip tem mais de {count} arquivos.', { count: IMPORT_LIMITS.maxFiles }));
      if (declaredTotal > IMPORT_LIMITS.maxTotalBytes) {
        throw new ImportLimitError(t('O conteúdo do zip passa de {size}.', { size: formatMb(IMPORT_LIMITS.maxTotalBytes) }));
      }
      return true;
    },
  });

  let total = 0;
  const entries: ImportEntry[] = [];
  for (const [name, bytes] of Object.entries(files)) {
    const path = normalizeArchivePath(name);
    if (!path) continue;
    total += bytes.byteLength;
    if (total > IMPORT_LIMITS.maxTotalBytes) {
      throw new ImportLimitError(t('O conteúdo do zip passa de {size}.', { size: formatMb(IMPORT_LIMITS.maxTotalBytes) }));
    }
    entries.push({ path, data: bytes });
  }
  return { entries: entries.sort((a, b) => a.path.localeCompare(b.path)), skipped };
}

/** Lê arquivos escolhidos no dispositivo (avulsos ou uma pasta inteira). */
export async function readDeviceFiles(files: readonly File[]): Promise<{ entries: ImportEntry[]; skipped: SkippedEntry[] }> {
  const skipped: SkippedEntry[] = [];
  const entries: ImportEntry[] = [];
  let total = 0;
  if (files.length > IMPORT_LIMITS.maxFiles) throw new ImportLimitError(t('Escolha no máximo {count} arquivos.', { count: IMPORT_LIMITS.maxFiles }));

  for (const file of files) {
    // Na escolha de pasta, webkitRelativePath traz "pasta/sub/arquivo.tex".
    const path = normalizeArchivePath(file.webkitRelativePath || file.name);
    if (!path) {
      skipped.push({ path: file.webkitRelativePath || file.name, reason: t('Caminho inválido ou arquivo de sistema') });
      continue;
    }
    if (file.size > IMPORT_LIMITS.maxFileBytes) {
      skipped.push({ path, reason: t('Maior que {size}', { size: formatMb(IMPORT_LIMITS.maxFileBytes) }) });
      continue;
    }
    total += file.size;
    if (total > IMPORT_LIMITS.maxTotalBytes) {
      throw new ImportLimitError(t('Os arquivos somam mais de {size}.', { size: formatMb(IMPORT_LIMITS.maxTotalBytes) }));
    }
    entries.push({ path, data: new Uint8Array(await file.arrayBuffer()) });
  }
  return { entries: entries.sort((a, b) => a.path.localeCompare(b.path)), skipped };
}

/** Monta o zip do projeto inteiro, com a mesma árvore de pastas. */
export function buildZip(files: ReadonlyArray<{ path: string; data: Uint8Array }>): Uint8Array {
  const tree: Zippable = {};
  for (const file of files) tree[file.path] = [file.data, { level: 6 }];
  return zipSync(tree);
}
