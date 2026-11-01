import { FileArchive, FilePlus2, FolderInput, Loader2 } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useT } from '@/hooks/use-t';
import { normalizeArchivePath } from '@/lib/project-archive/archive-paths';
import {
  planImport,
  singleRootFolder,
  stripRootFolder,
  type ConflictPolicy,
  type ImportEntry,
} from '@/lib/project-archive/import-plan';
import { readDeviceFiles, readZip, type SkippedEntry } from '@/lib/project-archive/zip';
import { cn } from '@/lib/utils';
import { useProjectArchive } from '../hooks/use-project-archive';
import { useProjectFiles } from '../hooks/use-project-files';
import { useEditorStore } from '../state/editor-store';

const ROOT_VALUE = '__root__';
const NEW_FOLDER_VALUE = '__new__';
const PREVIEW_LIMIT = 200;

interface LoadedSource {
  label: string;
  entries: ImportEntry[];
  skipped: SkippedEntry[];
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Todas as pastas do projeto, derivadas dos caminhos dos arquivos. */
function foldersOf(paths: readonly string[]): string[] {
  const folders = new Set<string>();
  for (const path of paths) {
    const parts = path.split('/').slice(0, -1);
    parts.forEach((_, index) => folders.add(parts.slice(0, index + 1).join('/')));
  }
  return [...folders].sort();
}

/**
 * Importação de .zip, de arquivos avulsos ou de uma pasta do dispositivo para
 * uma pasta do projeto. O plano (o que será criado, sobrescrito ou renomeado)
 * aparece antes da confirmação.
 */
export function ImportDialog() {
  const { t } = useT();
  const { projectId, importOpen, setImportOpen } = useEditorStore();
  const { data: files = [] } = useProjectFiles(projectId);
  const { applyImport } = useProjectArchive(projectId);
  const zipInput = useRef<HTMLInputElement>(null);
  const filesInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement | null>(null);
  const folderSelectId = useId();
  const newFolderId = useId();

  const [source, setSource] = useState<LoadedSource | null>(null);
  const [isReading, setIsReading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [folderChoice, setFolderChoice] = useState(ROOT_VALUE);
  const [newFolder, setNewFolder] = useState('');
  const [conflict, setConflict] = useState<ConflictPolicy>('overwrite');
  const [stripRoot, setStripRoot] = useState(true);

  useEffect(() => {
    if (importOpen) return;
    setSource(null);
    setError(null);
    setNewFolder('');
    setFolderChoice(ROOT_VALUE);
  }, [importOpen]);

  const folders = useMemo(() => foldersOf(files.map((file) => file.path)), [files]);
  const root = source ? singleRootFolder(source.entries) : null;
  const entries = useMemo(
    () => (source && root && stripRoot ? stripRootFolder(source.entries, root) : (source?.entries ?? [])),
    [source, root, stripRoot],
  );
  const targetFolder =
    folderChoice === ROOT_VALUE ? '' : folderChoice === NEW_FOLDER_VALUE ? (normalizeArchivePath(newFolder) ?? '') : folderChoice;
  const plan = useMemo(
    () => planImport({ existingPaths: files.map((file) => file.path), entries, targetFolder, conflict }),
    [files, entries, targetFolder, conflict],
  );
  const totalBytes = entries.reduce((sum, entry) => sum + entry.data.byteLength, 0);

  const load = async (label: string, read: () => Promise<{ entries: ImportEntry[]; skipped: SkippedEntry[] }>) => {
    setError(null);
    setIsReading(true);
    try {
      const result = await read();
      if (result.entries.length === 0) setError(t('Nenhum arquivo aproveitável encontrado.'));
      setSource({ label, ...result });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('Não foi possível ler os arquivos.'));
    } finally {
      setIsReading(false);
    }
  };

  const handleZip = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void load(file.name, async () => readZip(new Uint8Array(await file.arrayBuffer())));
  };

  const handleFiles = (event: ChangeEvent<HTMLInputElement>, label: string) => {
    const picked = [...(event.target.files ?? [])];
    event.target.value = '';
    if (picked.length > 0) void load(label, () => readDeviceFiles(picked));
  };

  const handleImport = async () => {
    setIsImporting(true);
    setError(null);
    try {
      await applyImport(plan, files);
      setImportOpen(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('A importação falhou.'));
    } finally {
      setIsImporting(false);
    }
  };

  const canImport = plan.operations.length > 0 && !(folderChoice === NEW_FOLDER_VALUE && !targetFolder);
  // A pasta aparece em <code> no meio da frase: o texto traduzido é dividido em volta dela.
  const stripRootLabel = t('Importar o conteúdo de {folder} direto na pasta de destino').split('{folder}');

  return (
    <Dialog open={importOpen} onOpenChange={setImportOpen}>
      <DialogContent className="flex h-[calc(100dvh-1rem)] max-w-xl flex-col gap-0 overflow-hidden p-0 sm:h-auto sm:max-h-[88vh]">
        <DialogHeader className="shrink-0 border-b px-5 pb-4 pt-5">
          <DialogTitle>{t('Importar para o projeto')}</DialogTitle>
          <DialogDescription>{t('Um arquivo .zip, arquivos avulsos ou uma pasta inteira do seu dispositivo.')}</DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden px-5 py-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Button type="button" variant="outline" disabled={isReading} onClick={() => zipInput.current?.click()}>
              <FileArchive />
              {t('Arquivo .zip')}
            </Button>
            <Button type="button" variant="outline" disabled={isReading} onClick={() => filesInput.current?.click()}>
              <FilePlus2 />
              {t('Arquivos')}
            </Button>
            <Button type="button" variant="outline" disabled={isReading} onClick={() => folderInput.current?.click()}>
              <FolderInput />
              {t('Pasta')}
            </Button>
          </div>
          <input ref={zipInput} type="file" accept=".zip,application/zip" className="hidden" onChange={handleZip} />
          <input ref={filesInput} type="file" multiple className="hidden" onChange={(event) => handleFiles(event, t('Arquivos escolhidos'))} />
          <input
            ref={(node) => {
              // O atributo de escolha de pasta não existe na tipagem do React. Ref de callback
              // porque o conteúdo do diálogo monta depois do efeito de abertura.
              node?.setAttribute('webkitdirectory', '');
              folderInput.current = node;
            }}
            type="file"
            multiple
            className="hidden"
            onChange={(event) => handleFiles(event, t('Pasta escolhida'))}
          />

          {isReading && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t('Lendo os arquivos')}
            </p>
          )}

          {source && (
            <>
              <p className="rounded-md border bg-muted/50 px-3 py-2 text-sm">
                <span className="font-medium">{source.label}</span>:{' '}
                {entries.length === 1 ? t('1 arquivo') : t('{count} arquivos', { count: entries.length })} ({formatSize(totalBytes)})
                {source.skipped.length > 0 && `, ${t('{count} ignorados', { count: source.skipped.length })}`}
              </p>

              {root && (
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 accent-primary"
                    checked={stripRoot}
                    onChange={(event) => setStripRoot(event.target.checked)}
                  />
                  <span className="min-w-0">
                    {stripRootLabel[0]}
                    <code className="font-mono">{root}/</code>
                    {stripRootLabel[1]}
                  </span>
                </label>
              )}

              <div className="flex min-w-0 flex-col gap-1.5">
                <label htmlFor={folderSelectId} className="text-sm font-medium">
                  {t('Pasta de destino')}
                </label>
                <Select value={folderChoice} onValueChange={setFolderChoice}>
                  <SelectTrigger id={folderSelectId}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ROOT_VALUE}>{t('Raiz do projeto')}</SelectItem>
                    {folders.map((folder) => (
                      <SelectItem key={folder} value={folder}>
                        {folder}/
                      </SelectItem>
                    ))}
                    <SelectItem value={NEW_FOLDER_VALUE}>{t('Nova pasta')}</SelectItem>
                  </SelectContent>
                </Select>
                {folderChoice === NEW_FOLDER_VALUE && (
                  <Input
                    id={newFolderId}
                    aria-label={t('Nome da nova pasta')}
                    placeholder={t('Ex.: capitulos/novos')}
                    value={newFolder}
                    onChange={(event) => setNewFolder(event.target.value)}
                  />
                )}
              </div>

              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-medium">{t('Arquivos com o mesmo nome na pasta')}</legend>
                {(
                  [
                    ['overwrite', t('Sobrescrever o arquivo existente')],
                    ['keep-both', t('Manter os dois: o importado recebe -1, -2... no nome')],
                  ] as const
                ).map(([value, label]) => (
                  <label key={value} className="flex items-start gap-2 text-sm">
                    <input
                      type="radio"
                      name="import-conflict"
                      className="mt-0.5 size-4 accent-primary"
                      checked={conflict === value}
                      onChange={() => setConflict(value)}
                    />
                    <span className="min-w-0">{label}</span>
                  </label>
                ))}
              </fieldset>

              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">
                  {plan.createCount === 1 ? t('Resultado: 1 novo') : t('Resultado: {count} novos', { count: plan.createCount })}
                  {plan.overwriteCount > 0 && `, ${t('{count} sobrescritos', { count: plan.overwriteCount })}`}
                  {plan.renamedCount > 0 && `, ${t('{count} renomeados', { count: plan.renamedCount })}`}
                </p>
                <ul className="max-h-56 overflow-y-auto rounded-md border text-xs">
                  {plan.operations.slice(0, PREVIEW_LIMIT).map((operation) => (
                    <li key={operation.targetPath} className="flex min-w-0 items-center gap-2 border-b px-3 py-1.5 last:border-b-0">
                      <span className="min-w-0 flex-1 truncate font-mono" title={operation.targetPath}>
                        {operation.targetPath}
                      </span>
                      <span
                        className={cn(
                          'shrink-0 rounded px-1.5 py-0.5 font-medium',
                          operation.action === 'overwrite'
                            ? 'bg-warning/20'
                            : operation.renamed
                              ? 'bg-accent text-accent-foreground'
                              : 'bg-success/15 text-success',
                        )}
                      >
                        {operation.action === 'overwrite' ? t('sobrescreve') : operation.renamed ? t('renomeado') : t('novo')}
                      </span>
                    </li>
                  ))}
                  {plan.operations.length > PREVIEW_LIMIT && (
                    <li className="px-3 py-1.5 text-muted-foreground">{t('e mais {count}', { count: plan.operations.length - PREVIEW_LIMIT })}</li>
                  )}
                </ul>
                {source.skipped.length > 0 && (
                  <details className="text-xs text-muted-foreground">
                    <summary className="cursor-pointer">{t('Ignorados ({count})', { count: source.skipped.length })}</summary>
                    <ul className="mt-1 flex flex-col gap-0.5">
                      {source.skipped.map((item) => (
                        <li key={item.path} className="break-all">
                          {item.path}: {item.reason}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            </>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter className="shrink-0 border-t bg-background px-5 py-4">
          <Button type="button" variant="outline" onClick={() => setImportOpen(false)}>
            {t('Cancelar')}
          </Button>
          <Button type="button" disabled={!canImport || isImporting} onClick={() => void handleImport()}>
            {isImporting && <Loader2 className="animate-spin" />}
            {isImporting
              ? t('Importando')
              : plan.operations.length
                ? t('Importar {count}', { count: plan.operations.length })
                : t('Importar')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
