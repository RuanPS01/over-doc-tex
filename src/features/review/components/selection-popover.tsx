import { MessageSquareQuote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useT } from '@/hooks/use-t';
import type { PageSelection } from '../hooks/use-text-selection';

/**
 * "Comentar trecho" logo abaixo da seleção (fixo na janela, preso às bordas
 * para não sair da tela em 360px nem ficar sob a barra do celular).
 */
export function SelectionPopover({ selection, onComment }: { selection: PageSelection; onComment: () => void }) {
  const { t } = useT();
  const last = selection.rects.at(-1);
  if (!last) return null;
  const top = Math.min(window.innerHeight - 56, last.bottom + 8);
  const left = Math.min(window.innerWidth - 176, Math.max(8, last.right - 160));
  return (
    <div className="fixed z-30" style={{ top, left }}>
      <Button
        size="sm"
        className="shadow-lg"
        // Sem isto o clique no botão desfaria a seleção antes de lê-la.
        onPointerDown={(event) => event.preventDefault()}
        onClick={onComment}
      >
        <MessageSquareQuote />
        {t('Comentar trecho')}
      </Button>
    </div>
  );
}
