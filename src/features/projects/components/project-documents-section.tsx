import { FilePlus2, Loader2, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useProjectDocuments, withMainDocument } from '../hooks/use-project-documents';

interface ProjectDocumentsSectionProps {
  projectId: string;
  projectName: string;
  canEdit: boolean;
  /** Arquivos .tex com \documentclass que podem virar documento. */
  rootCandidates: ReadonlyArray<{ id: string; path: string }>;
}

/**
 * Documentos compiláveis do projeto: o principal e os secundários (apêndice,
 * carta de resposta), cada um com PDF próprio na versão. O revisor vê o
 * principal e os secundários escolhidos em "Solicitar revisão".
 */
export function ProjectDocumentsSection({ projectId, projectName, canEdit, rootCandidates }: ProjectDocumentsSectionProps) {
  const { data = [], addDocument, removeDocument } = useProjectDocuments(projectId);
  const documents = withMainDocument(data, projectName);
  const available = rootCandidates.filter((file) => !documents.some((document) => document.rootPath === file.path));
  const [rootId, setRootId] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAdd = async (event: FormEvent) => {
    event.preventDefault();
    const root = available.find((file) => file.id === rootId);
    if (!root) return;
    setBusy('add');
    setError(null);
    try {
      const fallbackTitle = root.path.slice(root.path.lastIndexOf('/') + 1).replace(/\.tex$/, '');
      await addDocument({ title: title.trim() || fallbackTitle, rootFileId: root.id, rootPath: root.path, order: documents.length });
      setRootId('');
      setTitle('');
    } catch {
      setError('Não foi possível adicionar o documento.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="flex flex-col gap-2 border-t pt-4">
      <h3 className="text-sm font-semibold">Documentos</h3>
      <ul className="flex flex-col gap-1">
        {documents.map((document) => (
          <li key={document.id} className="flex min-w-0 items-center gap-2 rounded-md border px-2 py-1.5">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm">{document.title}</span>
              <span className="truncate font-mono text-xs text-muted-foreground">{document.rootPath}</span>
            </span>
            {document.role === 'main' ? (
              <span className="shrink-0 text-xs text-muted-foreground">Principal</span>
            ) : (
              canEdit && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0"
                  aria-label={`Remover o documento ${document.title}`}
                  disabled={busy !== null}
                  onClick={async () => {
                    setBusy(document.id);
                    await removeDocument(document.id).catch(() => setError('Não foi possível remover o documento.'));
                    setBusy(null);
                  }}
                >
                  <Trash2 />
                </Button>
              )
            )}
          </li>
        ))}
      </ul>
      {canEdit &&
        (available.length > 0 ? (
          <form onSubmit={(event) => void handleAdd(event)} className="flex min-w-0 flex-col gap-2 sm:flex-row">
            <Select value={rootId} onValueChange={setRootId}>
              <SelectTrigger className="min-w-0 sm:w-48" aria-label="Arquivo raiz do documento">
                <SelectValue placeholder="Arquivo raiz" />
              </SelectTrigger>
              <SelectContent>
                {available.map((file) => (
                  <SelectItem key={file.id} value={file.id}>
                    {file.path}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={title}
              maxLength={120}
              placeholder="Título (ex.: Apêndice)"
              aria-label="Título do documento"
              className="min-w-0 sm:flex-1"
              onChange={(event) => setTitle(event.target.value)}
            />
            <Button type="submit" variant="outline" disabled={!rootId || busy !== null}>
              {busy === 'add' ? <Loader2 className="animate-spin" /> : <FilePlus2 />}
              Adicionar
            </Button>
          </form>
        ) : (
          <p className="text-xs text-muted-foreground">
            Para um documento secundário, crie outro .tex com \documentclass (ex.: apendice.tex) e adicione aqui.
          </p>
        ))}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </section>
  );
}
