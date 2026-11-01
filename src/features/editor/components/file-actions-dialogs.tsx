import { Loader2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useT } from '@/hooks/use-t';
import { FileActionError, useFileActions } from '../hooks/use-file-actions';
import type { EditorFile } from '../model/editor-file';
import { useEditorStore } from '../state/editor-store';
import { FileNameDialog } from './file-name-dialog';

export type FileAction = { kind: 'create'; folder: string } | { kind: 'rename'; file: EditorFile } | { kind: 'delete'; file: EditorFile };

interface FileActionsDialogsProps {
  action: FileAction | null;
  files: readonly EditorFile[];
  onClose: () => void;
}

/** Diálogos de criar, renomear e excluir arquivo, abertos pela árvore. */
export function FileActionsDialogs({ action, files, onClose }: FileActionsDialogsProps) {
  const { t } = useT();
  const messageOf = (error: unknown) =>
    error instanceof FileActionError ? error.message : t('Não foi possível salvar. Confira a conexão e a sua permissão no projeto.');
  const { projectId, openFile } = useEditorStore();
  const { createFile, renameFile, deleteFile } = useFileActions(projectId);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const setOpen = (open: boolean) => {
    if (open) return;
    setDeleteError(null);
    onClose();
  };

  return (
    <>
      <FileNameDialog
        open={action?.kind === 'create'}
        onOpenChange={setOpen}
        title={t('Novo arquivo')}
        description={t('Informe o caminho. Pastas que não existem são criadas junto.')}
        initialValue={action?.kind === 'create' && action.folder ? `${action.folder}/` : ''}
        submitLabel={t('Criar')}
        onSubmit={async (path) => {
          try {
            openFile(await createFile(path, files));
            return null;
          } catch (error) {
            return messageOf(error);
          }
        }}
      />
      <FileNameDialog
        open={action?.kind === 'rename'}
        onOpenChange={setOpen}
        title={t('Renomear ou mover')}
        description={t('Mude o nome ou a pasta. Lembre de atualizar os \\input e \\includegraphics que apontam para ele.')}
        initialValue={action?.kind === 'rename' ? action.file.path : ''}
        submitLabel={t('Renomear')}
        onSubmit={async (path) => {
          if (action?.kind !== 'rename') return null;
          try {
            await renameFile(action.file, path, files);
            return null;
          } catch (error) {
            return messageOf(error);
          }
        }}
      />
      <Dialog open={action?.kind === 'delete'} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('Excluir arquivo')}</DialogTitle>
            <DialogDescription>
              {action?.kind === 'delete' ? t('{path} sai do rascunho. As versões congeladas continuam com ele.', { path: action.file.path }) : ''}
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <p role="alert" className="text-sm text-destructive">
              {deleteError}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t('Cancelar')}
            </Button>
            <Button
              variant="destructive"
              disabled={isDeleting}
              onClick={async () => {
                if (action?.kind !== 'delete') return;
                setIsDeleting(true);
                try {
                  await deleteFile(action.file);
                  setOpen(false);
                } catch (error) {
                  setDeleteError(messageOf(error));
                } finally {
                  setIsDeleting(false);
                }
              }}
            >
              {isDeleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
              {t('Excluir')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
