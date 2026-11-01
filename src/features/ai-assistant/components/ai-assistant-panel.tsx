import { GripHorizontal, Loader2, RotateCcw, Settings2, Sparkles, X } from 'lucide-react';
import { useEffect, useRef, useState, type HTMLAttributes, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import type { LayoutMode } from '@/hooks/use-layout-mode';
import { useT } from '@/hooks/use-t';
import { isConfigUsable } from '@/lib/ai/providers';
import type { AiSourceFile } from '@/lib/ai/schemas';
import { cn } from '@/lib/utils';
import { useAiConfig } from '../hooks/use-ai-config';
import { useAiStream } from '../hooks/use-ai-stream';
import { useAssistantWindow } from '../hooks/use-assistant-window';
import { AiComposer } from './ai-composer';
import { DockedAssistant } from './ai-docked-assistant';
import { AiMessage } from './ai-message';
import { AiSettingsDialog } from './ai-settings-dialog';
import { DockMenu } from './dock-menu';

type AiStream = ReturnType<typeof useAiStream>;

interface AiChatProps {
  chat: AiStream;
  state: 'loading' | 'unconfigured' | 'ready';
  onOpenSettings: () => void;
  onClose: () => void;
  /** Alça de arraste da janela (desktop). */
  headerProps?: HTMLAttributes<HTMLDivElement>;
  /** Botões da janela antes dos demais (encaixe). */
  windowControls?: ReactNode;
}

/** Conversa completa: janela solta no desktop e Sheet no celular. */
function AiChat({ chat, state, onOpenSettings, onClose, headerProps, windowControls }: AiChatProps) {
  const { t } = useT();
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
        className={cn('flex h-11 shrink-0 items-center gap-1 border-b pl-3 pr-1', headerProps?.className)}
      >
        {headerProps && <GripHorizontal className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
        <Sparkles className="size-4 shrink-0 text-primary" />
        <h2 className="min-w-0 flex-1 truncate pl-1 text-sm font-semibold">{t('Assistente')}</h2>
        {windowControls}
        <Button variant="ghost" size="icon" aria-label={t('Configurar a minha IA')} onClick={onOpenSettings}>
          <Settings2 />
        </Button>
        <Button variant="ghost" size="icon" aria-label={t('Nova conversa')} onClick={chat.reset}>
          <RotateCcw />
        </Button>
        <Button variant="ghost" size="icon" aria-label={t('Fechar assistente')} onClick={onClose}>
          <X />
        </Button>
      </div>

      {state === 'loading' ? (
        <p className="m-auto flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t('Carregando a sua configuração de IA')}
        </p>
      ) : state === 'unconfigured' ? (
        <div className="m-auto flex max-w-xs flex-col items-center gap-3 p-4 text-center">
          <Sparkles className="size-6 text-primary" />
          <p className="text-sm text-muted-foreground">
            {t('O assistente usa a sua própria IA. Escolha o provedor (Claude, OpenAI ou Gemini) e cole a sua chave de API para começar.')}
          </p>
          <Button onClick={onOpenSettings}>{t('Configurar a minha IA')}</Button>
        </div>
      ) : (
        <>
          <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3">
            {chat.messages.length === 0 && (
              <p className="m-auto max-w-xs text-center text-sm text-muted-foreground">
                {t('Peça para reescrever um trecho, gerar um rascunho a partir dos capítulos ou verificar se as referências estão acessíveis.')}
              </p>
            )}
            {chat.messages.map((message) => (
              <AiMessage key={message.id} message={message} />
            ))}
          </div>
          <AiComposer isStreaming={chat.isStreaming} onSend={(input) => void chat.send(input)} onStop={chat.stop} />
        </>
      )}
    </div>
  );
}

interface AiAssistantPanelProps {
  layoutMode: LayoutMode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Arquivos do projeto usados como contexto (RAG). */
  files: readonly AiSourceFile[];
}

/**
 * Assistente de IA ("Ask anything"), ligado e desligado pelo botão do cabeçalho:
 * - desktop: encaixado no rodapé (à direita, por padrão; também à esquerda ou
 *   no meio) como uma aba que revela a janela compacta (DockedAssistant), ou
 *   janela solta, arrastada pelo título;
 * - celular: Sheet inferior com 85% da altura visível.
 * Os hooks ficam acima do condicional, então fechar o painel não perde a conversa.
 */
export function AiAssistantPanel({ layoutMode, open, onOpenChange, files }: AiAssistantPanelProps) {
  const { t } = useT();
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
    if (windowState.state.mode === 'docked') {
      return (
        <>
          {settings}
          <DockedAssistant
            chat={chat}
            state={state}
            dock={windowState.state.dock}
            windowState={windowState.state}
            viewport={windowState.viewport}
            onOpenSettings={openSettings}
            onTurnOff={close}
            onDock={windowState.dock}
            onUndock={windowState.undock}
            dragHandleProps={windowState.dragHandleProps}
          />
        </>
      );
    }
    const position = windowState.position;
    return (
      <>
        {settings}
        <aside
          aria-label={t('Assistente de IA')}
          data-dock="floating"
          data-assistant-window
          style={{ width: windowState.size.width, height: windowState.size.height, ...(position ? { left: position.x, top: position.y } : {}) }}
          className={cn(
            'fixed z-40 flex flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-2xl',
            windowState.isDragging && 'select-none shadow-[0_24px_48px_-12px] shadow-overlay/40',
          )}
        >
          <AiChat
            chat={chat}
            state={state}
            onOpenSettings={openSettings}
            onClose={close}
            headerProps={{
              ...windowState.dragHandleProps,
              className: cn('touch-none', windowState.isDragging ? 'cursor-grabbing' : 'cursor-grab'),
              title: t('Arraste para mover a janela'),
            }}
            windowControls={<DockMenu state={windowState.state} onDock={windowState.dock} onUndock={windowState.undock} />}
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
        <SheetTitle className="sr-only">{t('Assistente de IA')}</SheetTitle>
        <SheetDescription className="sr-only">{t('Converse com a IA sobre o documento.')}</SheetDescription>
        {content}
      </SheetContent>
    </Sheet>
    </>
  );
}
