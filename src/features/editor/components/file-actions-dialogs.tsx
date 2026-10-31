import { Loader2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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

const messageOf = (error: unknown) =>
  error instanceof FileActionError ? error.message : 'Não foi possível salvar. Confira a conexão e a sua permissão no projeto.';

/** Diálogos de criar, renomear e excluir arquivo, abertos pela árvore. */
export function FileActionsDialogs({ action, files, onClose }: FileActionsDialogsProps) {
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
        title="Novo arquivo"
        description="Informe o caminho. Pastas que não existem são criadas junto."
        initialValue={action?.kind === 'create' && action.folder ? `${action.folder}/` : ''}
        submitLabel="Criar"
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
        title="Renomear ou mover"
        description="Mude o nome ou a pasta. Lembre de atualizar os \input e \includegraphics que apontam para ele."
        initialValue={action?.kind === 'rename' ? action.file.path : ''}
        submitLabel="Renomear"
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
            <DialogTitle>Excluir arquivo</DialogTitle>
            <DialogDescription>
              {action?.kind === 'delete' ? `${action.file.path} sai do rascunho. As versões congeladas continuam com ele.` : ''}
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <p role="alert" className="text-sm text-destructive">
              {deleteError}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
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
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
