import Editor, { useMonaco, type Monaco } from '@monaco-editor/react';
import { FileCode2 } from 'lucide-react';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useIsDarkTheme } from '@/hooks/use-is-dark-theme';
import { LATEX_LANGUAGE_ID, registerLatexLanguage } from '@/lib/monaco/latex-language';
import { applyEditorTheme } from '@/lib/monaco/theme-from-tokens';
import { cn } from '@/lib/utils';
import { useFileAutosave, type SaveStatus } from '../hooks/use-file-autosave';
import { useProjectFiles } from '../hooks/use-project-files';
import { useEditorStore } from '../state/editor-store';

const SAVE_LABELS: Record<SaveStatus, string> = {
  idle: '',
  pending: 'Alterações não salvas',
  saving: 'Salvando',
  saved: 'Salvo',
  error: 'Erro ao salvar',
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
  const { projectId, activeFileId, setImportOpen } = useEditorStore();
  const { data: files, isPending } = useProjectFiles(projectId);
  const file = files?.find((candidate) => candidate.id === activeFileId);
  const autosave = useFileAutosave(projectId);
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
    <section aria-label="Editor de código" className="flex h-full min-w-0 flex-col bg-background">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b px-3 text-xs text-muted-foreground">
        <FileCode2 className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{file?.path ?? 'Nenhum arquivo aberto'}</span>
        <span
          role="status"
          title={autosave.error ?? undefined}
          className={cn('shrink-0', autosave.status === 'error' && 'font-medium text-destructive')}
        >
          {SAVE_LABELS[autosave.status]}
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
            onChange={(value) => autosave.schedule(file.id, value ?? '')}
            theme={isDark ? 'overdoctex-dark' : 'overdoctex-light'}
            beforeMount={handleBeforeMount}
            loading={<EditorSkeleton />}
            options={{
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
              <p>Este arquivo é binário e não abre no editor de texto.</p>
            ) : (
              <>
                <p>Nenhum arquivo de texto no projeto ainda.</p>
                <Button variant="link" size="sm" onClick={() => setImportOpen(true)}>
                  Importar arquivos ou um .zip
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
