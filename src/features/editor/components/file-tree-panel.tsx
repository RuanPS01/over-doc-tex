import { BookMarked, Download, FileCode2, FileImage, FileText, Folder, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { FileKind } from '@shared/firestore/types';
import { cn } from '@/lib/utils';
import { useExportProject } from '../hooks/use-export-project';
import { useProjectFiles } from '../hooks/use-project-files';
import type { EditorFile } from '../model/editor-file';
import { useEditorStore } from '../state/editor-store';

const ICONS: Partial<Record<FileKind, typeof FileText>> = {
  tex: FileCode2,
  bib: BookMarked,
  image: FileImage,
  pdf: FileImage,
};

interface TreeRow {
  key: string;
  depth: number;
  label: string;
  file: EditorFile | null;
}

/** Achata os caminhos em linhas indentadas, inserindo as pastas implícitas. */
function toRows(files: readonly EditorFile[]): TreeRow[] {
  const rows: TreeRow[] = [];
  const seenFolders = new Set<string>();
  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    const parts = file.path.split('/');
    parts.slice(0, -1).forEach((folder, index) => {
      const key = parts.slice(0, index + 1).join('/');
      if (seenFolders.has(key)) return;
      seenFolders.add(key);
      rows.push({ key, depth: index, label: folder, file: null });
    });
    rows.push({ key: file.id, depth: parts.length - 1, label: file.name, file });
  }
  return rows;
}

export function FileTreePanel({ className }: { className?: string }) {
  const { projectId, activeFileId, openFile, setImportOpen } = useEditorStore();
  const { data: files = [], isPending } = useProjectFiles(projectId);
  const { exportProject, isExporting } = useExportProject();

  return (
    <nav aria-label="Arquivos do projeto" className={cn('flex h-full min-w-0 flex-col bg-panel', className)}>
      <div className="flex h-9 shrink-0 items-center gap-1 border-b pl-3 pr-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <span className="min-w-0 flex-1 truncate">Arquivos</span>
        <Button variant="ghost" size="icon" className="size-7" aria-label="Importar arquivos" title="Importar .zip, arquivos ou pasta" onClick={() => setImportOpen(true)}>
          <Upload />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label="Exportar projeto em .zip"
          title="Exportar projeto em .zip"
          disabled={isExporting}
          onClick={() => void exportProject()}
        >
          <Download />
        </Button>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto py-1 text-sm">
        {isPending && <li className="px-3 py-2 text-muted-foreground">Carregando...</li>}
        {toRows(files).map((row) => {
          const Icon = row.file ? (ICONS[row.file.kind] ?? FileText) : Folder;
          const isActive = row.file?.id === activeFileId;
          const canOpen = Boolean(row.file && row.file.content !== null);
          return (
            <li key={row.key}>
              <button
                type="button"
                disabled={!canOpen}
                onClick={() => row.file && openFile(row.file.id)}
                style={{ paddingLeft: `${0.75 + row.depth * 1}rem` }}
                className={cn(
                  'flex w-full min-w-0 items-center gap-2 py-1.5 pr-3 text-left transition-colors hover:bg-accent disabled:cursor-default disabled:hover:bg-transparent',
                  isActive && 'bg-accent font-medium text-accent-foreground',
                  !row.file && 'text-muted-foreground',
                )}
              >
                <Icon className="size-4 shrink-0" />
                <span className="truncate">{row.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
