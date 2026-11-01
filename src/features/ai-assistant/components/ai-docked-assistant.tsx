import { ChevronDown, ChevronUp, Loader2, MoreVertical, Power, RotateCcw, Settings2, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState, type HTMLAttributes } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useT } from '@/hooks/use-t';
import type { AiTask } from '@/lib/ai/schemas';
import { cn } from '@/lib/utils';
import type { useAiStream } from '../hooks/use-ai-stream';
import { DOCK_TAB_ATTRIBUTE, useDockReveal } from '../hooks/use-dock-reveal';
import { dockedMessagesMaxHeight, dockedPanelWidth, type AssistantWindowState, type DockPosition } from '../model/assistant-window';
import { AiComposer, TASK_LABELS } from './ai-composer';
import { AiMessage } from './ai-message';
import { DockMenu } from './dock-menu';

/** Sugestões que aparecem antes da primeira mensagem: escolhem a tarefa do campo de texto. */
const SUGGESTED_TASKS: readonly AiTask[] = ['rewriteText', 'paraphrase', 'generateDraft', 'checkReferences'];

const WRAPPER_POSITION: Record<DockPosition, string> = {
  left: 'left-4',
  center: 'left-1/2 -translate-x-1/2',
  right: 'right-4',
};

const TAB_POSITION: Record<DockPosition, string> = {
  left: 'left-3',
  center: 'left-1/2 -translate-x-1/2',
  right: 'right-3',
};

const SIDE_BUTTON = 'size-8 rounded-full border bg-card shadow-sm';

interface DockedAssistantProps {
  chat: ReturnType<typeof useAiStream>;
  state: 'loading' | 'unconfigured' | 'ready';
  dock: DockPosition;
  windowState: AssistantWindowState;
  viewport: { width: number; height: number };
  onOpenSettings: () => void;
  /** Desliga o assistente (o mesmo que o botão do cabeçalho): some até a aba. */
  onTurnOff: () => void;
  onDock: (dock: DockPosition) => void;
  onUndock: () => void;
  /** Arrastar a alça de cima solta a janela. */
  dragHandleProps: HTMLAttributes<HTMLDivElement>;
}

/**
 * Assistente encaixado no rodapé, como uma aba: o mouse em cima revela a
 * janela, que volta à aba se o mouse sair sem interação; clique ou foco dentro
 * a fixam até "Ocultar" ou Esc. Aberta, ocupa pouco: a conversa cresce até um
 * teto, o campo de texto fica embaixo e os controles ao lado.
 */
export function DockedAssistant({ chat, state, dock, windowState, viewport, onOpenSettings, onTurnOff, onDock, onUndock, dragHandleProps }: DockedAssistantProps) {
  const { t } = useT();
  // Montado quando o assistente é ligado (ou encaixado): começa aberto e fixado, pronto para digitar.
  const { reveal, revealed, send, containerProps } = useDockReveal(true);
  const [task, setTask] = useState<AiTask>('chat');
  const [seenId, setSeenId] = useState<string | null>(null);
  const asideRef = useRef<HTMLElement>(null);
  const tabRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const focusInput = useRef(true);
  const last = chat.messages.at(-1);
  const lastDone = last?.role === 'assistant' && last.status !== 'streaming' ? last.id : null;
  const unread = !revealed && lastDone !== null && lastDone !== seenId;

  // Ao abrir pela aba (ou ao ligar), o cursor vai para o campo de texto. Espera dois quadros: no
  // primeiro quadro da transição a janela ainda está com visibility: hidden e não aceita foco.
  useEffect(() => {
    if (reveal === 'pinned' && focusInput.current) {
      let frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          focusInput.current = false;
          inputRef.current?.focus({ preventScroll: true });
        });
      });
      return () => cancelAnimationFrame(frame);
    }
    focusInput.current = false;
    // Ao ocultar com o foco dentro da janela, o foco passa para a aba (a janela some da tela).
    const active = document.activeElement;
    if (reveal === 'tab' && active !== tabRef.current && asideRef.current?.contains(active)) tabRef.current?.focus({ preventScroll: true });
  }, [reveal]);

  // Resposta concluída com a janela aberta conta como vista; a que termina com a janela oculta acende o aviso na aba.
  useEffect(() => {
    if (revealed && lastDone) setSeenId(lastDone);
  }, [revealed, lastDone]);

  // Acompanha o fim da conversa enquanto o texto chega.
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [chat.messages.length, last?.text, revealed]);

  const openFromTab = () => {
    focusInput.current = true;
    send('open');
  };

  const chooseTask = (next: AiTask) => {
    setTask((current) => (current === next ? 'chat' : next));
    inputRef.current?.focus();
  };

  const hidden = 'pointer-events-none invisible translate-y-3 opacity-0';
  const shown = 'pointer-events-auto visible translate-y-0 opacity-100';

  return (
    <aside
      ref={asideRef}
      {...containerProps}
      aria-label={t('Assistente de IA')}
      data-dock={dock}
      data-reveal={reveal}
      className={cn('pointer-events-none fixed bottom-0 z-40', WRAPPER_POSITION[dock])}
    >
      <div className={cn('flex items-end gap-2', dock === 'right' && 'flex-row-reverse')}>
        <div className="relative" style={{ width: dockedPanelWidth(viewport) }}>
          <section
            data-assistant-window
            aria-hidden={!revealed}
            className={cn(
              'flex origin-bottom flex-col overflow-hidden rounded-t-xl border border-b-0 bg-card text-card-foreground shadow-2xl transition-[opacity,transform,visibility] duration-200 ease-out motion-reduce:transition-none',
              revealed ? shown : hidden,
            )}
          >
            <div
              {...dragHandleProps}
              className="flex h-5 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
              title={t('Arraste para soltar a janela')}
            >
              <span className="h-1 w-10 rounded-full bg-muted-foreground/30" aria-hidden />
            </div>

            {state === 'loading' ? (
              <p className="flex items-center gap-2 px-3 pb-3 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                {t('Carregando a sua configuração de IA')}
              </p>
            ) : state === 'unconfigured' ? (
              <div className="flex flex-col gap-2 px-3 pb-3 sm:flex-row sm:items-center">
                <p className="flex-1 text-xs text-muted-foreground">
                  {t('O assistente usa a sua própria IA. Escolha o provedor (Claude, OpenAI ou Gemini) e cole a sua chave de API para começar.')}
                </p>
                <Button size="sm" className="shrink-0" onClick={onOpenSettings}>
                  {t('Configurar a minha IA')}
                </Button>
              </div>
            ) : (
              <>
                {chat.messages.length > 0 ? (
                  <div ref={listRef} className="flex min-h-0 flex-col gap-3 overflow-y-auto px-3 pb-2 text-[13px]" style={{ maxHeight: dockedMessagesMaxHeight(viewport) }}>
                    {chat.messages.map((message) => (
                      <AiMessage key={message.id} message={message} />
                    ))}
                  </div>
                ) : (
                  <div role="group" aria-label={t('Sugestões de tarefa')} className="flex flex-wrap gap-1.5 px-3 pb-2">
                    {SUGGESTED_TASKS.map((option) => (
                      <button
                        key={option}
                        type="button"
                        aria-pressed={task === option}
                        onClick={() => chooseTask(option)}
                        className={cn(
                          'rounded-full border px-2.5 py-0.5 text-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          task === option && 'border-primary bg-primary/10 text-primary hover:bg-primary/15',
                        )}
                      >
                        {t(TASK_LABELS[option])}
                      </button>
                    ))}
                  </div>
                )}
                <div className="mx-2 mb-2 rounded-lg border bg-background focus-within:ring-1 focus-within:ring-ring">
                  <AiComposer
                    compact
                    task={task}
                    onTaskChange={setTask}
                    inputRef={inputRef}
                    isStreaming={chat.isStreaming}
                    onSend={(input) => void chat.send(input)}
                    onStop={chat.stop}
                  />
                </div>
              </>
            )}
          </section>

          <button
            ref={tabRef}
            type="button"
            {...{ [DOCK_TAB_ATTRIBUTE]: '' }}
            aria-expanded={revealed}
            aria-label={
              chat.isStreaming ? t('Mostrar o assistente (respondendo)') : unread ? t('Mostrar o assistente (nova resposta)') : t('Mostrar o assistente')
            }
            title={t('Mostrar o assistente')}
            onClick={openFromTab}
            className={cn(
              'absolute bottom-0 flex h-7 items-center gap-1.5 rounded-t-lg border border-b-0 bg-card px-3 text-xs font-medium shadow-md transition-[opacity,transform,height] duration-150 hover:h-8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none',
              TAB_POSITION[dock],
              revealed ? 'pointer-events-none translate-y-2 opacity-0' : 'pointer-events-auto opacity-100',
            )}
          >
            {chat.isStreaming ? <Loader2 className="size-3.5 animate-spin text-primary" aria-hidden /> : <Sparkles className="size-3.5 text-primary" aria-hidden />}
            {t('Assistente')}
            {unread && <span className="size-1.5 rounded-full bg-primary" aria-hidden />}
            <ChevronUp className="size-3.5 text-muted-foreground" aria-hidden />
          </button>
        </div>

        <div className={cn('flex flex-col gap-1.5 pb-2 transition-[opacity,visibility] duration-200 motion-reduce:transition-none', revealed ? shown : hidden)} aria-hidden={!revealed}>
          <Button variant="ghost" size="icon" className={SIDE_BUTTON} aria-label={t('Ocultar o assistente')} title={t('Ocultar o assistente')} onClick={() => send('hide')}>
            <ChevronDown />
          </Button>
          <DockMenu state={windowState} className={SIDE_BUTTON} onDock={onDock} onUndock={onUndock} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className={SIDE_BUTTON} aria-label={t('Mais opções do assistente')} title={t('Mais opções do assistente')}>
                <MoreVertical />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={dock === 'right' ? 'start' : 'end'} side="top">
              <DropdownMenuItem className="gap-2" onSelect={chat.reset}>
                <RotateCcw className="size-4 text-muted-foreground" />
                {t('Nova conversa')}
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2" onSelect={onOpenSettings}>
                <Settings2 className="size-4 text-muted-foreground" />
                {t('Configurar a minha IA')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="gap-2" onSelect={onTurnOff}>
                <Power className="size-4 text-muted-foreground" />
                {t('Desligar o assistente')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </aside>
  );
}
