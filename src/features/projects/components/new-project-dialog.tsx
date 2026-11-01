import { useState, type FormEvent } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useT } from '@/hooks/use-t';
import { useCreateProject } from '../hooks/use-projects';
import { MAX_PROJECT_NAME, normalizeProjectName } from '../model/new-project';

interface NewProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Cria o projeto com um main.tex inicial e abre o editor dele. */
export function NewProjectDialog({ open, onOpenChange }: NewProjectDialogProps) {
  const { t } = useT();
  const [name, setName] = useState('');
  const createProject = useCreateProject();
  const [, navigate] = useLocation();
  const normalized = normalizeProjectName(name);

  const handleOpenChange = (next: boolean) => {
    if (createProject.isPending) return;
    if (!next) {
      setName('');
      createProject.reset();
    }
    onOpenChange(next);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!normalized) return;
    createProject.mutate(normalized, { onSuccess: (projectId) => navigate(`/p/${projectId}`) });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{t('Novo projeto')}</DialogTitle>
            <DialogDescription>{t('O projeto começa com um main.tex; depois dá para importar um .zip ou arquivos.')}</DialogDescription>
          </DialogHeader>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {t('Nome do projeto')}
            <Input
              autoFocus
              required
              maxLength={MAX_PROJECT_NAME}
              placeholder={t('Ex.: Dissertação de mestrado')}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          {createProject.isError && (
            <p className="text-sm text-destructive" role="alert">
              {t('Não foi possível criar o projeto.')} {createProject.error.message}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={createProject.isPending} onClick={() => handleOpenChange(false)}>
              {t('Cancelar')}
            </Button>
            <Button type="submit" disabled={!normalized || createProject.isPending}>
              {createProject.isPending ? t('Criando') : t('Criar projeto')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
