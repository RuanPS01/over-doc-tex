import Editor, { useMonaco, type Monaco, type OnMount } from '@monaco-editor/react';
import { Crosshair, FileCode2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { UndoRedoButtons } from '@/components/common/undo-redo-buttons';
import { Button } from '@/components/ui/button';
import { useIsDarkTheme } from '@/hooks/use-is-dark-theme';
import { useT } from '@/hooks/use-t';
import { useUndoShortcuts } from '@/hooks/use-undo-shortcuts';
import { msg } from '@/lib/i18n';
import { LATEX_LANGUAGE_ID, registerLatexLanguage } from '@/lib/monaco/latex-language';
import { applyEditorTheme } from '@/lib/monaco/theme-from-tokens';
import { cn } from '@/lib/utils';
import { useFileAutosave, type SaveStatus } from '../hooks/use-file-autosave';
import { useCompileStore } from '../state/compile-store';
import { useProjectFiles } from '../hooks/use-project-files';
import { useEditorStore } from '../state/editor-store';

const SAVE_LABELS: Record<SaveStatus, string> = {
  idle: '',
  pending: msg('Alterações não salvas'),
  saving: msg('Salvando'),
  saved: msg('Salvo'),
  error: msg('Erro ao salvar'),
};

function EditorSkeleton() {
  return (
    <div className="flex h-full flex-col gap-2 p-4" aria-hidden>
      {[72, 54, 88, 40, 66].map((width) => (
        <div key={width} className="h-3 animate-pulse rounded bg-muted" style={{ width: `${width}%` }} />
      ))}
    </div>
  );
}

export function CodeEditorPanel() {
  const { t } = useT();
  const { projectId, activeFileId, setImportOpen, revealRequest, canEdit } = useEditorStore();
  const { data: files, isPending } = useProjectFiles(projectId);
  const file = files?.find((candidate) => candidate.id === activeFileId);
  const autosave = useFileAutosave(projectId);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const { synctex, showInPdf } = useCompileStore();
  // Desfazer e refazer do arquivo aberto: o histórico é o do próprio Monaco (um por arquivo, pelo `path`).
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });
  const syncHistory = () => {
    const model = editorRef.current?.getModel();
    setHistory({ canUndo: Boolean(model?.canUndo()), canRedo: Boolean(model?.canRedo()) });
  };
  const runHistory = (command: 'undo' | 'redo') => {
    const editor = editorRef.current;
    if (!editor || !canEdit) return;
    editor.focus();
    editor.trigger('toolbar', command, null);
    syncHistory();
  };
  // Dentro do Monaco o atalho é dele; fora (árvore de arquivos, barra), Ctrl+Z também desfaz o arquivo aberto.
  useUndoShortcuts({ enabled: canEdit && file?.content != null, onUndo: () => runHistory('undo'), onRedo: () => runHistory('redo') });
  const canShowInPdf = Boolean(synctex && file && synctex.files.includes(file.path));

  // Clique num erro da compilação, duplo clique no PDF ou "Abrir no código": abre o arquivo
  // (feito pelo store) e leva o cursor à linha. Se o Monaco ainda não montou, o onMount aplica.
  const revealRef = useRef(revealRequest);
  revealRef.current = revealRequest;
  const reveal = (editor: Parameters<OnMount>[0], line: number) => {
    const target = Math.min(line, editor.getModel()?.getLineCount() ?? line);
    editor.revealLineInCenter(target);
    editor.setPosition({ lineNumber: target, column: 1 });
    editor.focus();
  };
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !revealRequest || revealRequest.fileId !== file?.id) return;
    reveal(editor, revealRequest.line);
  }, [revealRequest, file?.id]);
  const isDark = useIsDarkTheme();
  const monaco = useMonaco();

  // Reaplica o tema quando o usuário alterna claro e escuro.
  useEffect(() => {
    if (monaco) monaco.editor.setTheme(applyEditorTheme(monaco, isDark));
  }, [monaco, isDark]);

  const handleBeforeMount = (instance: Monaco) => {
    registerLatexLanguage(instance);
    applyEditorTheme(instance, isDark);
  };

  return (
    <section aria-label={t('Editor de código')} className="flex h-full min-w-0 flex-col bg-background">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b px-3 text-xs text-muted-foreground">
        <FileCode2 className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{file?.path ?? t('Nenhum arquivo aberto')}</span>
        {!canEdit && <span className="shrink-0">{t('Somente leitura')}</span>}
        {canEdit && file?.content != null && (
          <UndoRedoButtons
            canUndo={history.canUndo}
            canRedo={history.canRedo}
            onUndo={() => runHistory('undo')}
            onRedo={() => runHistory('redo')}
            buttonClassName="size-7"
          />
        )}
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          aria-label={t('Mostrar no PDF')}
          title={t('Mostrar no PDF a linha do cursor (duplo clique no PDF faz o caminho inverso)')}
          disabled={!canShowInPdf}
          onClick={() => {
            const line = editorRef.current?.getPosition()?.lineNumber ?? 1;
            if (file) showInPdf(file.path, line);
          }}
        >
          <Crosshair />
        </Button>
        <span
          role="status"
          title={autosave.error ?? undefined}
          className={cn('shrink-0', autosave.status === 'error' && 'font-medium text-destructive')}
        >
          {t(SAVE_LABELS[autosave.status])}
        </span>
      </div>
      {autosave.error && (
        <p className="shrink-0 border-b bg-destructive/5 px-3 py-1.5 text-xs text-destructive" role="alert">
          {autosave.error}
        </p>
      )}
      <div className="min-h-0 flex-1">
        {file?.content != null ? (
          <Editor
            // `path` mantém um modelo por arquivo: trocar de layout não perde desfazer nem cursor.
            path={file.path}
            defaultLanguage={file.kind === 'bib' ? 'plaintext' : LATEX_LANGUAGE_ID}
            defaultValue={file.content}
            onChange={(value) => canEdit && autosave.schedule(file.id, value ?? '')}
            theme={isDark ? 'overdoctex-dark' : 'overdoctex-light'}
            beforeMount={handleBeforeMount}
            onMount={(editor) => {
              editorRef.current = editor;
              editor.onDidChangeModelContent(syncHistory);
              editor.onDidChangeModel(syncHistory);
              syncHistory();
              const pending = revealRef.current;
              if (pending && pending.fileId === file.id) reveal(editor, pending.line);
            }}
            loading={<EditorSkeleton />}
            options={{
              // Quem só lê o projeto vê o código, mas as regras recusariam a gravação.
              readOnly: !canEdit,
              automaticLayout: true,
              minimap: { enabled: false },
              wordWrap: 'on',
              fontSize: 14,
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              scrollBeyondLastLine: false,
              tabSize: 2,
              padding: { top: 8 },
            }}
          />
        ) : isPending ? (
          <EditorSkeleton />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
            {file ? (
              <p>{t('Este arquivo é binário e não abre no editor de texto.')}</p>
            ) : (
              <>
                <p>{t('Nenhum arquivo de texto no projeto ainda.')}</p>
                {canEdit && (
                  <Button variant="link" size="sm" onClick={() => setImportOpen(true)}>
                    {t('Importar arquivos ou um .zip')}
                  </Button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
