import { BookMarked, Download, FileCode2, FileImage, FilePlus, FileText, Folder, MoreHorizontal, Pencil, Trash2, Upload } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { FileKind } from '@shared/firestore/types';
import { cn } from '@/lib/utils';
import { useExportProject } from '../hooks/use-export-project';
import { useProjectFiles } from '../hooks/use-project-files';
import type { EditorFile } from '../model/editor-file';
import { useEditorStore } from '../state/editor-store';
import { FileActionsDialogs, type FileAction } from './file-actions-dialogs';

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
  const { projectId, activeFileId, openFile, setImportOpen, canEdit } = useEditorStore();
  const { data: files = [], isPending } = useProjectFiles(projectId);
  const { exportProject, isExporting } = useExportProject();
  const [action, setAction] = useState<FileAction | null>(null);
  const activeFolder = files.find((file) => file.id === activeFileId)?.path.split('/').slice(0, -1).join('/') ?? '';

  return (
    <nav aria-label="Arquivos do projeto" className={cn('flex h-full min-w-0 flex-col bg-panel', className)}>
      <div className="flex h-9 shrink-0 items-center gap-1 border-b pl-3 pr-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <span className="min-w-0 flex-1 truncate">Arquivos</span>
        {canEdit && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label="Novo arquivo"
              title="Novo arquivo"
              onClick={() => setAction({ kind: 'create', folder: activeFolder })}
            >
              <FilePlus />
            </Button>
            <Button variant="ghost" size="icon" className="size-7" aria-label="Importar arquivos" title="Importar .zip, arquivos ou pasta" onClick={() => setImportOpen(true)}>
              <Upload />
            </Button>
          </>
        )}
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
            <li key={row.key} className="group flex min-w-0 items-center">
              <button
                type="button"
                disabled={!canOpen}
                onClick={() => row.file && openFile(row.file.id)}
                style={{ paddingLeft: `${0.75 + row.depth * 1}rem` }}
                className={cn(
                  'flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-2 text-left transition-colors hover:bg-muted disabled:cursor-default disabled:hover:bg-transparent',
                  isActive && 'bg-accent font-medium text-accent-foreground hover:bg-accent',
                  !row.file && 'text-muted-foreground',
                )}
              >
                <Icon className="size-4 shrink-0" />
                <span className="truncate">{row.label}</span>
              </button>
              {row.file && canEdit && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Ações de ${row.file.path}`}
                      className="mr-1 size-7 shrink-0 opacity-0 focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100"
                    >
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => row.file && setAction({ kind: 'rename', file: row.file })}>
                      <Pencil />
                      Renomear ou mover
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onSelect={() => row.file && setAction({ kind: 'delete', file: row.file })}
                    >
                      <Trash2 />
                      Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </li>
          );
        })}
      </ul>
      <FileActionsDialogs action={action} files={files} onClose={() => setAction(null)} />
    </nav>
  );
}
