import { cn } from '@/lib/utils';
import { useEditorStore } from '../state/editor-store';
import { CodeEditorPanel } from './code-editor-panel';
import { PdfPane } from './pdf-pane';
import { PaneSwitcher } from './pane-switcher';

interface MobileWorkspaceProps {
  orientation: 'portrait' | 'landscape';
}

/**
 * Celular:
 * - retrato: um painel por vez (editor OU PDF). Os dois continuam montados e
 *   o inativo recebe `hidden`, preservando cursor, desfazer e rolagem do PDF;
 * - paisagem com pouca altura: editor e PDF em duas colunas curtas.
 * A árvore de arquivos fica no Sheet lateral (FileTreeSheet).
 */
export function MobileWorkspace({ orientation }: MobileWorkspaceProps) {
  const { activePane, setActivePane } = useEditorStore();

  if (orientation === 'landscape') {
    return (
      <div className="grid h-full min-h-0 grid-cols-2 divide-x">
        <div className="min-h-0 min-w-0">
          <CodeEditorPanel />
        </div>
        <div className="min-h-0 min-w-0">
          <PdfPane />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PaneSwitcher value={activePane} onChange={setActivePane} />
      <div className="relative min-h-0 flex-1">
        <div className={cn('absolute inset-0', activePane !== 'code' && 'hidden')}>
          <CodeEditorPanel />
        </div>
        <div className={cn('absolute inset-0', activePane !== 'pdf' && 'hidden')}>
          <PdfPane />
        </div>
      </div>
    </div>
  );
}
