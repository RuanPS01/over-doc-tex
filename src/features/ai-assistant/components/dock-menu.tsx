import { AppWindow, PanelBottom } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useT } from '@/hooks/use-t';
import { DOCK_POSITIONS, type AssistantWindowState, type DockPosition } from '../model/assistant-window';

const DOCK_VALUE_FLOATING = 'floating';

/** Encaixe da janela: rodapé à esquerda, no meio, à direita ou janela solta. */
export function DockMenu({
  state,
  className,
  onDock,
  onUndock,
}: {
  state: AssistantWindowState;
  className?: string;
  onDock: (dock: DockPosition) => void;
  onUndock: () => void;
}) {
  const { t } = useT();
  const value = state.mode === 'docked' ? state.dock : DOCK_VALUE_FLOATING;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={className}
          aria-label={state.mode === 'docked' ? t('Encaixe da janela (encaixada no rodapé)') : t('Encaixe da janela (solta)')}
          title={t('Encaixar no rodapé ou soltar')}
        >
          {state.mode === 'docked' ? <PanelBottom /> : <AppWindow />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t('Posição do assistente')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next) => {
            if (next === DOCK_VALUE_FLOATING) onUndock();
            else if (DOCK_POSITIONS.some((position) => position.value === next)) onDock(next as DockPosition);
          }}
        >
          {DOCK_POSITIONS.map((position) => (
            <DropdownMenuRadioItem key={position.value} value={position.value}>
              {t(position.label)}
            </DropdownMenuRadioItem>
          ))}
          <DropdownMenuRadioItem value={DOCK_VALUE_FLOATING}>{t('Janela solta (arraste pelo título)')}</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
