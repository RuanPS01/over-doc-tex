import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  allFolders,
  ancestorFolders,
  DEFAULT_FILE_TREE_OPTIONS,
  fileTreeRows,
  isFileTreeSort,
  type FileTreeOptions,
  type FileTreeRow,
} from '../model/file-tree';
import type { EditorFile } from '../model/editor-file';

const OPTIONS_KEY = 'overdoctex.file-tree';
const expandedKey = (projectId: string) => `overdoctex.file-tree.expanded.${projectId}`;

/** localStorage pode falhar (aba anônima, cota): a preferência é só conveniência. */
function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignorado de propósito.
  }
}

function readOptions(): FileTreeOptions {
  const stored = readJson(OPTIONS_KEY);
  if (!stored || typeof stored !== 'object') return DEFAULT_FILE_TREE_OPTIONS;
  const { sort, foldersFirst } = stored as Partial<Record<keyof FileTreeOptions, unknown>>;
  return {
    sort: isFileTreeSort(sort) ? sort : DEFAULT_FILE_TREE_OPTIONS.sort,
    foldersFirst: typeof foldersFirst === 'boolean' ? foldersFirst : DEFAULT_FILE_TREE_OPTIONS.foldersFirst,
  };
}

function readExpanded(projectId: string): Set<string> {
  const stored = readJson(expandedKey(projectId));
  return new Set(Array.isArray(stored) ? stored.filter((path): path is string => typeof path === 'string') : []);
}

export interface FileTreeView {
  rows: FileTreeRow[];
  options: FileTreeOptions;
  setOptions: (options: FileTreeOptions) => void;
  toggleFolder: (path: string) => void;
  expandAll: () => void;
  collapseAll: () => void;
}

/**
 * Estado de exibição da árvore de arquivos: pastas começam recolhidas (as
 * abertas ficam lembradas por projeto neste navegador), ordenação e pastas no
 * topo valem para todos os projetos. Abrir um arquivo dentro de uma pasta
 * recolhida (busca, SyncTeX, arquivo novo) abre as pastas até ele.
 */
export function useFileTreeView(projectId: string, files: readonly EditorFile[], activeFileId: string | null): FileTreeView {
  const [options, setOptionsState] = useState(readOptions);
  const [expanded, setExpanded] = useState(() => readExpanded(projectId));
  const loadedFor = useRef(projectId);

  // Outro projeto na mesma aba: troca as pastas abertas pelas dele.
  useEffect(() => {
    if (loadedFor.current === projectId) return;
    loadedFor.current = projectId;
    setExpanded(readExpanded(projectId));
  }, [projectId]);

  const updateExpanded = useCallback(
    (update: (current: Set<string>) => Set<string>) => {
      setExpanded((current) => {
        const next = update(current);
        writeJson(expandedKey(projectId), [...next]);
        return next;
      });
    },
    [projectId],
  );

  const activePath = files.find((file) => file.id === activeFileId)?.path ?? null;
  const revealed = useRef<string | null>(null);
  useEffect(() => {
    if (!activePath || revealed.current === activePath) return;
    revealed.current = activePath;
    const ancestors = ancestorFolders(activePath);
    if (ancestors.length === 0) return;
    updateExpanded((current) => (ancestors.every((path) => current.has(path)) ? current : new Set([...current, ...ancestors])));
  }, [activePath, updateExpanded]);

  const setOptions = useCallback((next: FileTreeOptions) => {
    setOptionsState(next);
    writeJson(OPTIONS_KEY, next);
  }, []);

  const toggleFolder = useCallback(
    (path: string) =>
      updateExpanded((current) => {
        const next = new Set(current);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        return next;
      }),
    [updateExpanded],
  );

  const expandAll = useCallback(() => updateExpanded(() => new Set(allFolders(files))), [files, updateExpanded]);
  const collapseAll = useCallback(() => updateExpanded(() => new Set()), [updateExpanded]);

  const rows = useMemo(() => fileTreeRows(files, options, expanded), [files, options, expanded]);
  return { rows, options, setOptions, toggleFolder, expandAll, collapseAll };
}
