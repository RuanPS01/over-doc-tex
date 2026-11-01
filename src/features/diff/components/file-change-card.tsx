import { ChevronDown, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useT } from '@/hooks/use-t';
import type { FileChange, FileChangeStatus } from '@/lib/diff/file-changes';
import { msg } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { DiffView } from './diff-view';

const STATUS_LABELS: Record<FileChangeStatus, string> = {
  added: msg('novo'),
  removed: msg('removido'),
  modified: msg('alterado'),
};

interface FileChangeCardProps {
  change: FileChange;
  defaultOpen: boolean;
  /** Presente quando o lado novo é o rascunho: abre o arquivo no editor. */
  onOpenFile?: () => void;
}

/** Um arquivo alterado, com o diff recolhível. */
export function FileChangeCard({ change, defaultOpen, onOpenFile }: FileChangeCardProps) {
  const { t } = useT();
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const { insertedWords, deletedWords } = change.stats;

  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <div className="flex min-w-0 items-center gap-1 border-b bg-muted/40 pr-1">
        <button
          type="button"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((open) => !open)}
          className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
        >
          <ChevronDown className={cn('size-4 shrink-0 transition-transform', !isOpen && '-rotate-90')} />
          <span className="min-w-0 truncate font-mono text-xs">{change.path}</span>
          <span className="shrink-0 rounded bg-background px-1.5 text-[11px] text-muted-foreground">{t(STATUS_LABELS[change.status])}</span>
          {change.segments && (
            <span className="ml-auto shrink-0 text-xs tabular-nums">
              <span className="text-diff-added">+{insertedWords}</span> <span className="text-diff-removed">-{deletedWords}</span>
            </span>
          )}
        </button>
        {onOpenFile && (
          <Button variant="ghost" size="icon" className="size-8 shrink-0" aria-label={t('Abrir {path} no editor', { path: change.path })} onClick={onOpenFile}>
            <ExternalLink />
          </Button>
        )}
      </div>
      {isOpen &&
        (change.segments ? (
          <div className="py-1">
            <DiffView segments={change.segments} />
          </div>
        ) : (
          <p className="px-3 py-2 text-xs text-muted-foreground">{t('Arquivo binário: o conteúdo mudou.')}</p>
        ))}
    </section>
  );
}
