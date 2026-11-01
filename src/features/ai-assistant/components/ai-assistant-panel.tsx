import { AppWindow, GripHorizontal, Loader2, PanelBottom, RotateCcw, Settings2, Sparkles, X } from 'lucide-react';
import { useEffect, useRef, useState, type HTMLAttributes, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import type { LayoutMode } from '@/hooks/use-layout-mode';
import { isConfigUsable } from '@/lib/ai/providers';
import type { AiSourceFile } from '@/lib/ai/schemas';
import { cn } from '@/lib/utils';
import { useAiConfig } from '../hooks/use-ai-config';
import { useAiStream } from '../hooks/use-ai-stream';
import { useAssistantWindow } from '../hooks/use-assistant-window';
import { DOCK_POSITIONS, type AssistantWindowState, type DockPosition } from '../model/assistant-window';
import { AiComposer } from './ai-composer';
import { AiMessage } from './ai-message';
import { AiSettingsDialog } from './ai-settings-dialog';

type AiStream = ReturnType<typeof useAiStream>;

interface AiChatProps {
  chat: AiStream;
  state: 'loading' | 'unconfigured' | 'ready';
  onOpenSettings: () => void;
  onClose: () => void;
  /** Encaixada no rodapé: cabeçalho, mensagens e campo de texto mais enxutos. */
  compact?: boolean;
  /** Alça de arraste da janela (desktop). */
  headerProps?: HTMLAttributes<HTMLDivElement>;
  /** Botões da janela antes dos demais (encaixe). */
  windowControls?: ReactNode;
}

function AiChat({ chat, state, onOpenSettings, onClose, compact = false, headerProps, windowControls }: AiChatProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const lastText = chat.messages.at(-1)?.text;

  // Acompanha o fim da conversa enquanto o texto chega.
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [chat.messages.length, lastText]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        {...headerProps}
        className={cn('flex shrink-0 items-center gap-1 border-b pl-3 pr-1', compact ? 'h-9' : 'h-11', headerProps?.className)}
      >
        {headerProps && <GripHorizontal className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
        <Sparkles className="size-4 shrink-0 text-primary" />
        <h2 className={cn('min-w-0 flex-1 truncate pl-1 font-semibold', compact ? 'text-xs' : 'text-sm')}>Assistente</h2>
        {windowControls}
        <Button variant="ghost" size="icon" className={cn(compact && 'size-8')} aria-label="Configurar a minha IA" onClick={onOpenSettings}>
          <Settings2 />
        </Button>
        <Button variant="ghost" size="icon" className={cn(compact && 'size-8')} aria-label="Nova conversa" onClick={chat.reset}>
          <RotateCcw />
        </Button>
        <Button variant="ghost" size="icon" className={cn(compact && 'size-8')} aria-label="Fechar assistente" onClick={onClose}>
          <X />
        </Button>
      </div>

      {state === 'loading' ? (
        <p className="m-auto flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Carregando a sua configuração de IA
        </p>
      ) : state === 'unconfigured' ? (
        <div className="m-auto flex max-w-xs flex-col items-center gap-3 p-4 text-center">
          <Sparkles className="size-6 text-primary" />
          <p className="text-sm text-muted-foreground">
            O assistente usa a sua própria IA. Escolha o provedor (Claude, OpenAI ou Gemini) e cole a sua chave de API para
            começar.
          </p>
          <Button onClick={onOpenSettings}>Configurar a minha IA</Button>
        </div>
      ) : (
        <>
          <div ref={listRef} className={cn('flex min-h-0 flex-1 flex-col overflow-y-auto', compact ? 'gap-3 p-2 text-[13px]' : 'gap-4 p-3')}>
            {chat.messages.length === 0 && (
              <p className="m-auto max-w-xs text-center text-sm text-muted-foreground">
                Peça para reescrever um trecho, gerar um rascunho a partir dos capítulos ou verificar se as
                referências estão acessíveis.
              </p>
            )}
            {chat.messages.map((message) => (
              <AiMessage key={message.id} message={message} />
            ))}
          </div>
          <AiComposer compact={compact} isStreaming={chat.isStreaming} onSend={(input) => void chat.send(input)} onStop={chat.stop} />
        </>
      )}
    </div>
  );
}

const DOCK_VALUE_FLOATING = 'floating';

/** Encaixe da janela: rodapé à esquerda, no meio, à direita ou janela solta. */
function DockMenu({ state, compact, onDock, onUndock }: { state: AssistantWindowState; compact: boolean; onDock: (dock: DockPosition) => void; onUndock: () => void }) {
  const value = state.mode === 'docked' ? state.dock : DOCK_VALUE_FLOATING;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(compact && 'size-8')}
          aria-label={state.mode === 'docked' ? 'Encaixe da janela (encaixada no rodapé)' : 'Encaixe da janela (solta)'}
          title="Encaixar no rodapé ou soltar"
        >
          {state.mode === 'docked' ? <PanelBottom /> : <AppWindow />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Posição do assistente</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next) => {
            if (next === DOCK_VALUE_FLOATING) onUndock();
            else if (DOCK_POSITIONS.some((position) => position.value === next)) onDock(next as DockPosition);
          }}
        >
          {DOCK_POSITIONS.map((position) => (
            <DropdownMenuRadioItem key={position.value} value={position.value}>
              {position.label}
            </DropdownMenuRadioItem>
          ))}
          <DropdownMenuRadioItem value={DOCK_VALUE_FLOATING}>Janela solta (arraste pelo título)</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const DOCK_CLASSES: Record<DockPosition, string> = {
  left: 'left-4',
  center: 'left-1/2 -translate-x-1/2',
  right: 'right-4',
};

interface AiAssistantPanelProps {
  layoutMode: LayoutMode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Arquivos do projeto usados como contexto (RAG). */
  files: readonly AiSourceFile[];
}

/**
 * Assistente de IA ("Ask anything"):
 * - desktop: janela sobre o workspace, encaixada no rodapé (à direita, por
 *   padrão; também à esquerda ou no meio, em exibição compacta) ou solta,
 *   arrastada pelo título;
 * - celular: Sheet inferior com 85% da altura visível.
 * Os hooks ficam acima do condicional, então fechar o painel não perde a conversa.
 */
export function AiAssistantPanel({ layoutMode, open, onOpenChange, files }: AiAssistantPanelProps) {
  const { config, isLoading } = useAiConfig();
  const chat = useAiStream({ config, files });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const windowState = useAssistantWindow();
  const state = isLoading ? 'loading' : isConfigUsable(config) ? 'ready' : 'unconfigured';

  const openSettings = () => setSettingsOpen(true);
  const close = () => onOpenChange(false);
  const settings = <AiSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />;

  if (layoutMode === 'desktop') {
    if (!open) return settings;
    const docked = windowState.state.mode === 'docked' ? windowState.state.dock : null;
    const position = windowState.position;
    return (
      <>
      {settings}
      <aside
        aria-label="Assistente de IA"
        data-dock={docked ?? 'floating'}
        style={{ width: windowState.size.width, height: windowState.size.height, ...(position ? { left: position.x, top: position.y } : {}) }}
        className={cn(
          'fixed z-40 flex flex-col overflow-hidden border bg-card text-card-foreground shadow-2xl',
          // Encaixada: presa ao rodapé, cantos de baixo retos; solta: janela com cantos redondos.
          docked ? cn('bottom-0 rounded-t-xl border-b-0', DOCK_CLASSES[docked]) : 'rounded-xl',
          windowState.isDragging && 'select-none shadow-[0_24px_48px_-12px] shadow-overlay/40',
        )}
      >
        <AiChat
          chat={chat}
          state={state}
          onOpenSettings={openSettings}
          onClose={close}
          compact={docked !== null}
          headerProps={{
            ...windowState.dragHandleProps,
            className: cn('touch-none', windowState.isDragging ? 'cursor-grabbing' : 'cursor-grab'),
            title: 'Arraste para mover a janela',
          }}
          windowControls={
            <DockMenu state={windowState.state} compact={docked !== null} onDock={windowState.dock} onUndock={windowState.undock} />
          }
        />
      </aside>
      </>
    );
  }
  const content = <AiChat chat={chat} state={state} onOpenSettings={openSettings} onClose={close} />;

  return (
    <>
    {settings}
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" showClose={false} className="h-[85dvh] gap-0 p-0">
        <SheetTitle className="sr-only">Assistente de IA</SheetTitle>
        <SheetDescription className="sr-only">Converse com a IA sobre o documento.</SheetDescription>
        {content}
      </SheetContent>
    </Sheet>
    </>
  );
}
