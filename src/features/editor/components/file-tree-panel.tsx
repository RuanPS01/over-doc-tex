import {
  ArrowDownUp,
  BookMarked,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Download,
  FileCode2,
  FileImage,
  FilePlus,
  FileText,
  Folder,
  FolderOpen,
  MoreHorizontal,
  Pencil,
  Trash2,
  Upload,
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { FileKind } from '@shared/firestore/types';
import { useT } from '@/hooks/use-t';
import { cn } from '@/lib/utils';
import { useExportProject } from '../hooks/use-export-project';
import { useFileTreeView, type FileTreeView } from '../hooks/use-file-tree-view';
import { useProjectFiles } from '../hooks/use-project-files';
import { FILE_TREE_SORTS, isFileTreeSort } from '../model/file-tree';
import { useEditorStore } from '../state/editor-store';
import { FileActionsDialogs, type FileAction } from './file-actions-dialogs';

const ICONS: Partial<Record<FileKind, typeof FileText>> = {
  tex: FileCode2,
  bib: BookMarked,
  image: FileImage,
  pdf: FileImage,
};

/** Ordenação, pastas no topo e abrir ou recolher todas as pastas. */
function FileTreeSortMenu({ view }: { view: FileTreeView }) {
  const { t } = useT();
  const { options, setOptions, expandAll, collapseAll } = view;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-7" aria-label={t('Ordenar e organizar arquivos')} title={t('Ordenar e organizar')}>
          <ArrowDownUp />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>{t('Ordenar por')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={options.sort} onValueChange={(value) => isFileTreeSort(value) && setOptions({ ...options, sort: value })}>
          {FILE_TREE_SORTS.map((sort) => (
            <DropdownMenuRadioItem key={sort.value} value={sort.value}>
              {t(sort.label)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem checked={options.foldersFirst} onCheckedChange={(checked) => setOptions({ ...options, foldersFirst: checked === true })}>
          {t('Pastas no topo')}
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={expandAll}>
          <ChevronsUpDown />
          {t('Abrir todas as pastas')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={collapseAll}>
          <ChevronsDownUp />
          {t('Recolher todas as pastas')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function FileTreePanel({ className }: { className?: string }) {
  const { t } = useT();
  const { projectId, activeFileId, openFile, setImportOpen, canEdit } = useEditorStore();
  const { data: files = [], isPending } = useProjectFiles(projectId);
  const { exportProject, isExporting } = useExportProject();
  const [action, setAction] = useState<FileAction | null>(null);
  const view = useFileTreeView(projectId, files, activeFileId);
  const activeFolder = files.find((file) => file.id === activeFileId)?.path.split('/').slice(0, -1).join('/') ?? '';

  return (
    <nav aria-label={t('Arquivos do projeto')} className={cn('flex h-full min-w-0 flex-col bg-panel', className)}>
      <div className="flex h-9 shrink-0 items-center gap-1 border-b pl-3 pr-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <span className="min-w-0 flex-1 truncate">{t('Arquivos')}</span>
        {canEdit && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label={t('Novo arquivo')}
              title={t('Novo arquivo')}
              onClick={() => setAction({ kind: 'create', folder: activeFolder })}
            >
              <FilePlus />
            </Button>
            <Button variant="ghost" size="icon" className="size-7" aria-label={t('Importar arquivos')} title={t('Importar .zip, arquivos ou pasta')} onClick={() => setImportOpen(true)}>
              <Upload />
            </Button>
          </>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={t('Exportar projeto em .zip')}
          title={t('Exportar projeto em .zip')}
          disabled={isExporting}
          onClick={() => void exportProject()}
        >
          <Download />
        </Button>
        <FileTreeSortMenu view={view} />
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto py-1 text-sm">
        {isPending && <li className="px-3 py-2 text-muted-foreground">{t('Carregando...')}</li>}
        {view.rows.map((row) => {
          const indent = { paddingLeft: `${0.5 + row.depth * 1}rem` };
          if (row.folderPath !== null) {
            const folderPath = row.folderPath;
            const FolderIcon = row.expanded ? FolderOpen : Folder;
            return (
              <li key={row.key} className="flex min-w-0 items-center">
                <button
                  type="button"
                  aria-expanded={row.expanded}
                  title={folderPath}
                  onClick={() => view.toggleFolder(folderPath)}
                  style={indent}
                  className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 pr-3 text-left text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <ChevronRight className={cn('size-4 shrink-0 transition-transform', row.expanded && 'rotate-90')} />
                  <FolderIcon className="size-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{row.label}</span>
                  <span className="shrink-0 text-xs tabular-nums">
                    {row.fileCount}
                    <span className="sr-only"> {row.fileCount === 1 ? t('arquivo') : t('arquivos')}</span>
                  </span>
                </button>
              </li>
            );
          }
          const Icon = (row.file && ICONS[row.file.kind]) ?? FileText;
          const isActive = row.file?.id === activeFileId;
          const canOpen = Boolean(row.file && row.file.content !== null);
          return (
            <li key={row.key} className="group flex min-w-0 items-center">
              <button
                type="button"
                disabled={!canOpen}
                onClick={() => row.file && openFile(row.file.id)}
                style={indent}
                className={cn(
                  'flex min-w-0 flex-1 items-center gap-1.5 py-1.5 pr-2 text-left transition-colors hover:bg-muted disabled:cursor-default disabled:hover:bg-transparent',
                  isActive && 'bg-accent font-medium text-accent-foreground hover:bg-accent',
                )}
              >
                {/* Espaço da seta das pastas, para os ícones do mesmo nível ficarem alinhados. */}
                <span className="size-4 shrink-0" aria-hidden="true" />
                <Icon className="size-4 shrink-0" />
                <span className="truncate">{row.label}</span>
              </button>
              {row.file && canEdit && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t('Ações de {path}', { path: row.file.path })}
                      className="mr-1 size-7 shrink-0 opacity-0 focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100"
                    >
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => row.file && setAction({ kind: 'rename', file: row.file })}>
                      <Pencil />
                      {t('Renomear ou mover')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onSelect={() => row.file && setAction({ kind: 'delete', file: row.file })}
                    >
                      <Trash2 />
                      {t('Excluir')}
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
