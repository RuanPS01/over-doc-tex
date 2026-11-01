import { ChevronRight, ListTree, X } from 'lucide-react';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { Button } from '@/components/ui/button';
import { useT } from '@/hooks/use-t';
import { ancestorIds, type PdfOutlineItem } from '@/lib/pdf/outline';
import { cn } from '@/lib/utils';

/** Botão da barra do visualizador que abre e fecha o índice. */
export function PdfOutlineToggle({ open, onToggle, className }: { open: boolean; onToggle: () => void; className?: string }) {
  const { t } = useT();
  return (
    <Button
      variant={open ? 'secondary' : 'ghost'}
      size="icon"
      className={cn('shrink-0', className)}
      aria-label={t('Índice do documento')}
      aria-pressed={open}
      title={t('Índice do documento')}
      onClick={onToggle}
    >
      <ListTree />
    </Button>
  );
}

interface PdfOutlinePanelProps {
  items: readonly PdfOutlineItem[];
  activeId: string | null;
  parents: ReadonlyMap<string, string | null>;
  /** Por cima do PDF (visualizador estreito) em vez de ao lado. */
  overlay: boolean;
  onSelect: (item: PdfOutlineItem) => void;
  onClose: () => void;
}

interface OutlineListProps {
  items: readonly PdfOutlineItem[];
  depth: number;
  activeId: string | null;
  expanded: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onSelect: (item: PdfOutlineItem) => void;
  activeRef: RefObject<HTMLButtonElement>;
}

function OutlineList({ items, depth, activeId, expanded, onToggle, onSelect, activeRef }: OutlineListProps) {
  const { t } = useT();
  return (
    <ul className="flex flex-col">
      {items.map((item) => {
        const hasChildren = item.children.length > 0;
        const isOpen = expanded.has(item.id);
        const isActive = item.id === activeId;
        return (
          <li key={item.id}>
            <div className="flex items-start" style={{ paddingLeft: depth * 14 }}>
              {hasChildren ? (
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-label={isOpen ? t('Recolher {title}', { title: item.title }) : t('Expandir {title}', { title: item.title })}
                  onClick={() => onToggle(item.id)}
                  className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ChevronRight className={cn('size-3.5 transition-transform motion-reduce:transition-none', isOpen && 'rotate-90')} />
                </button>
              ) : (
                <span className="w-6 shrink-0" aria-hidden />
              )}
              <button
                ref={isActive ? activeRef : undefined}
                type="button"
                disabled={item.page === null}
                aria-current={isActive ? 'location' : undefined}
                onClick={() => onSelect(item)}
                className={cn(
                  'min-w-0 flex-1 rounded px-1.5 py-1 text-left text-xs leading-snug hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:text-muted-foreground disabled:hover:bg-transparent',
                  isActive && 'bg-primary/10 font-medium text-primary hover:bg-primary/15',
                )}
              >
                {item.title}
              </button>
            </div>
            {hasChildren && isOpen && (
              <OutlineList items={item.children} depth={depth + 1} activeId={activeId} expanded={expanded} onToggle={onToggle} onSelect={onSelect} activeRef={activeRef} />
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Índice do PDF (como o do leitor do Chrome): a hierarquia de capítulos e
 * seções, com a seção atual marcada. Ao rolar o PDF, os níveis de cima da
 * seção atual abrem sozinhos e ela fica visível na lista; o clique rola o PDF
 * até a seção.
 */
export function PdfOutlinePanel({ items, activeId, parents, overlay, onSelect, onClose }: PdfOutlinePanelProps) {
  const { t } = useT();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const activeRef = useRef<HTMLButtonElement>(null);

  // A seção atual aparece: os níveis acima dela abrem (os que a pessoa abriu continuam abertos).
  useEffect(() => {
    if (!activeId) return;
    const chain = ancestorIds(activeId, parents);
    setExpanded((current) => (chain.every((id) => current.has(id)) ? current : new Set([...current, ...chain])));
  }, [activeId, parents]);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activeId, expanded]);

  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <nav
      aria-label={t('Índice do documento')}
      className={cn(
        'flex min-h-0 flex-col bg-background',
        overlay ? 'absolute inset-y-0 left-0 z-20 w-72 max-w-[85%] border-r shadow-xl' : 'h-full w-full',
      )}
    >
      <div className="flex h-9 shrink-0 items-center gap-2 border-b pl-3 pr-1 text-xs font-medium">
        <ListTree className="size-3.5 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{t('Índice')}</span>
        <Button variant="ghost" size="icon" className="size-7" aria-label={t('Fechar o índice')} onClick={onClose}>
          <X />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        <OutlineList items={items} depth={0} activeId={activeId} expanded={expanded} onToggle={toggle} onSelect={onSelect} activeRef={activeRef} />
      </div>
    </nav>
  );
}
