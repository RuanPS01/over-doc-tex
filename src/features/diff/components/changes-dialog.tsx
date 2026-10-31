import { History, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { TreeChanges } from '@/lib/diff/file-changes';
import { useVersionComparison, type ComparedSide } from '../hooks/use-tree-changes';
import { useVisualDiff, type VisualDiff } from '../hooks/use-visual-diff';
import { DiffPdfViewer } from './diff-pdf-viewer';
import { FileChangeCard } from './file-change-card';

const DRAFT = 'draft';

interface ChangesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  /** Versão base pedida (ex.: "Comparar" no histórico); nulo usa a mais recente. */
  initialBaseId: string | null;
  onOpenFile: (path: string) => void;
  onOpenHistory: () => void;
  /** Quem edita guarda o diff em PDF entre versões no cache (diffs/{diffKey}). */
  canEdit: boolean;
}

/** "Ver alterações": o código de uma versão comparado com outra versão ou com o rascunho. */
export function ChangesDialog({ open, onOpenChange, projectId, initialBaseId, onOpenFile, onOpenHistory, canEdit }: ChangesDialogProps) {
  const { snapshots, isPending, compare } = useVersionComparison(projectId, open);
  const { betweenVersions, againstDraft } = useVisualDiff(projectId);
  const [view, setView] = useState<'code' | 'pdf'>('code');
  const [documentId, setDocumentId] = useState('main');
  const [visual, setVisual] = useState<{ diff: VisualDiff | null; error: string | null; loading: string | null }>({ diff: null, error: null, loading: null });
  const [baseId, setBaseId] = useState<string | null>(null);
  const [targetId, setTargetId] = useState<string>(DRAFT);
  const [result, setResult] = useState<TreeChanges | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isComparing, setIsComparing] = useState(false);

  // Cada abertura começa da versão pedida (ou da mais recente) contra o rascunho.
  useEffect(() => {
    if (!open) return;
    setBaseId(initialBaseId);
    setTargetId(DRAFT);
    setView('code');
  }, [open, initialBaseId]);

  const effectiveBase = baseId ?? snapshots[0]?.id ?? null;

  useEffect(() => {
    if (!open || !effectiveBase) return;
    const base = snapshots.find((snapshot) => snapshot.id === effectiveBase);
    const target = targetId === DRAFT ? null : snapshots.find((snapshot) => snapshot.id === targetId);
    if (!base || (targetId !== DRAFT && !target)) return;
    const sides: [ComparedSide, ComparedSide] = [
      { kind: 'snapshot', snapshot: base },
      target ? { kind: 'snapshot', snapshot: target } : { kind: 'draft' },
    ];
    let cancelled = false;
    setIsComparing(true);
    setError(null);
    compare(...sides)
      .then((changes) => !cancelled && setResult(changes))
      .catch(() => !cancelled && setError('Não foi possível ler os arquivos para comparar. Confira a conexão.'))
      .finally(() => !cancelled && setIsComparing(false));
    return () => {
      cancelled = true;
    };
  }, [open, effectiveBase, targetId, snapshots, compare]);

  const baseSnapshot = snapshots.find((snapshot) => snapshot.id === effectiveBase);
  const documentIds = baseSnapshot ? Object.keys(baseSnapshot.documents) : ['main'];

  // Diff visual: recompila o documento com as marcações (pode levar alguns segundos).
  useEffect(() => {
    if (!open || view !== 'pdf' || !effectiveBase) return;
    let cancelled = false;
    setVisual({ diff: null, error: null, loading: 'Gerando a comparação em PDF' });
    const run = targetId === DRAFT ? againstDraft(effectiveBase, documentId) : betweenVersions(effectiveBase, targetId, documentId, canEdit);
    run
      .then((diff) => !cancelled && setVisual({ diff, error: null, loading: null }))
      .catch((caught: unknown) => !cancelled && setVisual({ diff: null, error: caught instanceof Error ? caught.message : 'Não foi possível gerar a comparação.', loading: null }));
    return () => {
      cancelled = true;
    };
  }, [open, view, effectiveBase, targetId, documentId, canEdit, againstDraft, betweenVersions]);

  const totals = result?.totals;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[calc(100dvh-1rem)] max-w-4xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-4 py-3 sm:px-5">
          <DialogTitle>Ver alterações</DialogTitle>
          <DialogDescription>Palavras inseridas aparecem em verde e as removidas, riscadas em vermelho.</DialogDescription>
        </DialogHeader>

        {isPending ? (
          <p className="m-auto flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Carregando as versões
          </p>
        ) : snapshots.length === 0 ? (
          <div className="m-auto flex max-w-sm flex-col items-center gap-3 p-6 text-center text-sm text-muted-foreground">
            <p>Ainda não há versões. Congele uma versão para comparar o rascunho com ela depois.</p>
            <Button size="sm" onClick={onOpenHistory}>
              <History />
              Abrir versões
            </Button>
          </div>
        ) : (
          <>
            <div className="grid shrink-0 grid-cols-1 gap-2 border-b px-4 py-3 sm:grid-cols-2 sm:px-5">
              <label className="flex min-w-0 flex-col gap-1 text-xs font-medium">
                Versão base
                <Select value={effectiveBase ?? undefined} onValueChange={setBaseId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {snapshots.map((snapshot) => (
                      <SelectItem key={snapshot.id} value={snapshot.id}>
                        Versão {snapshot.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="flex min-w-0 flex-col gap-1 text-xs font-medium">
                Comparar com
                <Select value={targetId} onValueChange={setTargetId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={DRAFT}>Rascunho atual</SelectItem>
                    {snapshots
                      .filter((snapshot) => snapshot.id !== effectiveBase)
                      .map((snapshot) => (
                        <SelectItem key={snapshot.id} value={snapshot.id}>
                          Versão {snapshot.label}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </label>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-2 sm:px-5">
              <Tabs value={view} onValueChange={(next) => setView(next as 'code' | 'pdf')}>
                <TabsList>
                  <TabsTrigger value="code">Código</TabsTrigger>
                  <TabsTrigger value="pdf">PDF marcado</TabsTrigger>
                </TabsList>
              </Tabs>
              {view === 'pdf' && documentIds.length > 1 && (
                <Select value={documentId} onValueChange={setDocumentId}>
                  <SelectTrigger className="h-8 w-auto min-w-0 max-w-[12rem] text-xs" aria-label="Documento">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {documentIds.map((id) => (
                      <SelectItem key={id} value={id}>
                        {baseSnapshot?.documents[id]?.title ?? id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {view === 'pdf' ? (
              <div className="min-h-0 flex-1">
                <DiffPdfViewer
                  diff={visual.diff}
                  loadingLabel={visual.loading}
                  error={visual.error}
                  fileName={`diff-${baseSnapshot?.label ?? ''}-${targetId === DRAFT ? 'rascunho' : (snapshots.find((item) => item.id === targetId)?.label ?? '')}.pdf`}
                />
              </div>
            ) : (
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5">
              {error ? (
                <p className="text-sm text-destructive">{error}</p>
              ) : isComparing || !result ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Comparando
                </p>
              ) : result.files.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma diferença entre as duas versões.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  <p role="status" className="text-sm">
                    {totals!.changedFiles} {totals!.changedFiles === 1 ? 'arquivo alterado' : 'arquivos alterados'}:{' '}
                    <span className="text-diff-added">{totals!.insertedWords} palavras inseridas</span>,{' '}
                    <span className="text-diff-removed">{totals!.deletedWords} removidas</span>.
                  </p>
                  {result.files.map((file) => (
                    <FileChangeCard
                      key={file.path}
                      change={file}
                      defaultOpen={result.files.length <= 5}
                      onOpenFile={targetId === DRAFT && file.status !== 'removed' ? () => onOpenFile(file.path) : undefined}
                    />
                  ))}
                </div>
              )}
            </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
