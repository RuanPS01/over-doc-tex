import Editor, { useMonaco, type Monaco } from '@monaco-editor/react';
import { FileCode2 } from 'lucide-react';
import { useEffect } from 'react';
import { useIsDarkTheme } from '@/hooks/use-is-dark-theme';
import { LATEX_LANGUAGE_ID, registerLatexLanguage } from '@/lib/monaco/latex-language';
import { applyEditorTheme } from '@/lib/monaco/theme-from-tokens';
import { useProjectFiles } from '../hooks/use-project-files';
import { useEditorStore } from '../state/editor-store';

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
  const { projectId, activeFileId } = useEditorStore();
  const { data: files } = useProjectFiles(projectId);
  const file = files?.find((candidate) => candidate.id === activeFileId);
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
        <span className="truncate">{file?.path ?? 'Nenhum arquivo aberto'}</span>
      </div>
      <div className="min-h-0 flex-1">
        {file?.content != null ? (
          <Editor
            // `path` mantém um modelo por arquivo: trocar de layout não perde desfazer nem cursor.
            path={file.path}
            defaultLanguage={file.kind === 'bib' ? 'plaintext' : LATEX_LANGUAGE_ID}
            defaultValue={file.content}
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
        ) : (
          <EditorSkeleton />
        )}
      </div>
    </section>
  );
}
