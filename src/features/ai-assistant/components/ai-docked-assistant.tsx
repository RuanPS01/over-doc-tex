import { ChevronDown, ChevronUp, Loader2, MoreVertical, Power, RotateCcw, Settings2, Sparkles } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type HTMLAttributes } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useT } from '@/hooks/use-t';
import type { AiTask } from '@/lib/ai/schemas';
import { cn } from '@/lib/utils';
import type { useAiStream } from '../hooks/use-ai-stream';
import { DOCK_TAB_ATTRIBUTE, useDockReveal } from '../hooks/use-dock-reveal';
import {
  DOCK_TAB_HEIGHT,
  dockedMessagesMaxHeight,
  dockedPanelWidth,
  dockMorphTransitions,
  type AssistantWindowState,
  type DockPosition,
} from '../model/assistant-window';
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

/** A janela (e o conteúdo, já na largura final) fica presa ao lado do encaixe e cresce para o outro. */
const ANCHOR: Record<DockPosition, string> = {
  left: 'left-0',
  center: 'left-1/2 -translate-x-1/2',
  right: 'right-0',
};

/** Controles laterais parados no lugar final, do lado de dentro da tela. */
const CONTROLS_SIDE: Record<DockPosition, string> = {
  left: 'left-[calc(100%+0.5rem)]',
  center: 'left-[calc(100%+0.5rem)]',
  right: 'right-[calc(100%+0.5rem)]',
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
 * Assistente encaixado no rodapé, como uma aba: o mouse em cima faz a aba
 * crescer até virar a janela, que volta à aba se o mouse sair sem interação;
 * clique ou foco dentro a fixam até "Ocultar" ou Esc. Aberta, ocupa pouco: a
 * conversa cresce até um teto, o campo de texto fica embaixo e os controles
 * ao lado, parados (só aparecem e somem, sem acompanhar o crescimento).
 */
export function DockedAssistant({ chat, state, dock, windowState, viewport, onOpenSettings, onTurnOff, onDock, onUndock, dragHandleProps }: DockedAssistantProps) {
  const { t } = useT();
  // Montado quando o assistente é ligado (ou encaixado): a aba cresce e fica aberta, pronta para digitar.
  const { reveal, revealed, send, containerProps } = useDockReveal(true);
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const contentRef = useRef<HTMLDivElement>(null);
  const tabLabelRef = useRef<HTMLSpanElement>(null);
  const [contentHeight, setContentHeight] = useState(0);
  const [tabWidth, setTabWidth] = useState(128);
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
    // Ao ocultar com o foco dentro da janela, o foco passa para a aba (a janela some da tela).
    const active = document.activeElement;
    if (reveal === 'tab' && active !== tabRef.current && asideRef.current?.contains(active)) tabRef.current?.focus({ preventScroll: true });
  }, [reveal]);

  // Resposta concluída com a janela aberta conta como vista; a que termina com a janela oculta acende o aviso na aba.
  useEffect(() => {
    if (revealed && lastDone) setSeenId(lastDone);
  }, [revealed, lastDone]);

  // A janela cresce até a altura do conteúdo e encolhe até a largura do rótulo da aba (que muda com o idioma).
  useLayoutEffect(() => {
    const content = contentRef.current;
    const label = tabLabelRef.current;
    if (!content || !label) return;
    const measure = () => {
      setContentHeight(content.offsetHeight);
      setTabWidth(label.offsetWidth);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    observer.observe(label);
    return () => observer.disconnect();
  }, []);

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

  const panelWidth = dockedPanelWidth(viewport);
  const motion = dockMorphTransitions(revealed);
  const transition = (value: string) => (reduceMotion ? 'none' : value);

  return (
    <aside
      ref={asideRef}
      {...containerProps}
      aria-label={t('Assistente de IA')}
      data-dock={dock}
      data-reveal={reveal}
      style={{ width: panelWidth }}
      className={cn('pointer-events-none fixed bottom-0 z-40 h-0', WRAPPER_POSITION[dock])}
    >
      {/* A aba e a janela são o mesmo elemento: ele cresce do tamanho da aba até o do conteúdo. */}
      <section
        data-assistant-window
        style={{
          // Mais 2px: a borda da esquerda e a da direita.
          width: revealed ? panelWidth : tabWidth + 2,
          height: revealed ? contentHeight + 1 : DOCK_TAB_HEIGHT,
          transition: transition(motion.card),
        }}
        className={cn(
          'pointer-events-auto absolute bottom-0 overflow-hidden border border-b-0 bg-card text-card-foreground',
          ANCHOR[dock],
          revealed ? 'rounded-t-xl shadow-2xl' : 'rounded-t-lg shadow-md',
        )}
      >
        <div
          ref={contentRef}
          data-dock-content
          aria-hidden={!revealed}
          style={{
            width: panelWidth - 2,
            opacity: revealed ? 1 : 0,
            filter: revealed ? 'blur(0)' : 'blur(6px)',
            visibility: revealed ? 'visible' : 'hidden',
            transition: transition(motion.content),
          }}
          className={cn('absolute bottom-0 flex flex-col', ANCHOR[dock])}
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
        </div>

        {/* Rótulo da aba: ocupa a aba recolhida e some logo que ela começa a crescer. */}
        <button
          ref={tabRef}
          type="button"
          {...{ [DOCK_TAB_ATTRIBUTE]: '' }}
          tabIndex={revealed ? -1 : 0}
          aria-hidden={revealed}
          aria-expanded={revealed}
          aria-label={
            chat.isStreaming ? t('Mostrar o assistente (respondendo)') : unread ? t('Mostrar o assistente (nova resposta)') : t('Mostrar o assistente')
          }
          title={t('Mostrar o assistente')}
          onClick={openFromTab}
          style={{ height: DOCK_TAB_HEIGHT - 1, opacity: revealed ? 0 : 1, transition: transition(motion.tab) }}
          className={cn(
            'absolute bottom-0 flex items-center justify-center rounded-t-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
            ANCHOR[dock],
            revealed && 'pointer-events-none',
          )}
        >
          <span ref={tabLabelRef} className="flex w-max items-center gap-1.5 whitespace-nowrap px-3 text-xs font-medium">
            {chat.isStreaming ? <Loader2 className="size-3.5 animate-spin text-primary" aria-hidden /> : <Sparkles className="size-3.5 text-primary" aria-hidden />}
            {t('Assistente')}
            {unread && <span className="size-1.5 rounded-full bg-primary" aria-hidden />}
            <ChevronUp className="size-3.5 text-muted-foreground" aria-hidden />
          </span>
        </button>
      </section>

      <div
        aria-hidden={!revealed}
        style={{ opacity: revealed ? 1 : 0, visibility: revealed ? 'visible' : 'hidden', transition: transition(motion.controls) }}
        className={cn('absolute bottom-2 flex flex-col gap-1.5', CONTROLS_SIDE[dock], revealed ? 'pointer-events-auto' : 'pointer-events-none')}
      >
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
    </aside>
  );
}
