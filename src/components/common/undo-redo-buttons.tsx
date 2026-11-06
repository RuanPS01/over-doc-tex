import { Loader2, Redo2, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useT } from '@/hooks/use-t';
import { cn } from '@/lib/utils';

interface UndoRedoButtonsProps {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  /** O que será desfeito ou refeito ("comentário novo"), mostrado na dica do botão. */
  undoLabel?: string | null;
  redoLabel?: string | null;
  /** Uma operação gravando: os botões esperam. */
  isBusy?: boolean;
  className?: string;
  buttonClassName?: string;
}

/** Botões Desfazer e Refazer, com o atalho e a ação na dica (Ctrl+Z, Ctrl+Shift+Z). */
export function UndoRedoButtons({ canUndo, canRedo, onUndo, onRedo, undoLabel, redoLabel, isBusy = false, className, buttonClassName }: UndoRedoButtonsProps) {
  const { t } = useT();
  const undoTitle = undoLabel ? t('Desfazer: {action} (Ctrl+Z)', { action: undoLabel }) : t('Desfazer (Ctrl+Z)');
  const redoTitle = redoLabel ? t('Refazer: {action} (Ctrl+Shift+Z)', { action: redoLabel }) : t('Refazer (Ctrl+Shift+Z)');
  return (
    <div className={cn('flex shrink-0 items-center', className)}>
      <Button variant="ghost" size="icon" className={cn('size-8', buttonClassName)} aria-label={undoTitle} title={undoTitle} disabled={!canUndo || isBusy} onClick={onUndo}>
        {isBusy ? <Loader2 className="animate-spin" /> : <Undo2 />}
      </Button>
      <Button variant="ghost" size="icon" className={cn('size-8', buttonClassName)} aria-label={redoTitle} title={redoTitle} disabled={!canRedo || isBusy} onClick={onRedo}>
        <Redo2 />
      </Button>
    </div>
  );
}
