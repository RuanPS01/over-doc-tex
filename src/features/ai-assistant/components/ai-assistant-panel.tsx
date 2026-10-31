import { Loader2, RotateCcw, Settings2, Sparkles, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import type { LayoutMode } from '@/hooks/use-layout-mode';
import { isConfigUsable } from '@/lib/ai/providers';
import type { AiSourceFile } from '@/lib/ai/schemas';
import { useAiConfig } from '../hooks/use-ai-config';
import { useAiStream } from '../hooks/use-ai-stream';
import { AiComposer } from './ai-composer';
import { AiMessage } from './ai-message';
import { AiSettingsDialog } from './ai-settings-dialog';

type AiStream = ReturnType<typeof useAiStream>;

interface AiChatProps {
  chat: AiStream;
  state: 'loading' | 'unconfigured' | 'ready';
  onOpenSettings: () => void;
  onClose: () => void;
}

function AiChat({ chat, state, onOpenSettings, onClose }: AiChatProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const lastText = chat.messages.at(-1)?.text;

  // Acompanha o fim da conversa enquanto o texto chega.
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [chat.messages.length, lastText]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-1 border-b pl-3 pr-1">
        <Sparkles className="size-4 shrink-0 text-primary" />
        <h2 className="min-w-0 flex-1 truncate pl-1 text-sm font-semibold">Assistente</h2>
        <Button variant="ghost" size="icon" aria-label="Configurar a minha IA" onClick={onOpenSettings}>
          <Settings2 />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Nova conversa" onClick={chat.reset}>
          <RotateCcw />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Fechar assistente" onClick={onClose}>
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
          <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3">
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
 * Assistente de IA ("Ask anything"):
 * - desktop: painel flutuante no canto inferior direito, sobre o workspace;
 * - celular: Sheet inferior com 85% da altura visível.
 * Os hooks ficam acima do condicional, então fechar o painel não perde a conversa.
 */
export function AiAssistantPanel({ layoutMode, open, onOpenChange, files }: AiAssistantPanelProps) {
  const { config, isLoading } = useAiConfig();
  const chat = useAiStream({ config, files });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const state = isLoading ? 'loading' : isConfigUsable(config) ? 'ready' : 'unconfigured';

  const content = (
    <AiChat chat={chat} state={state} onOpenSettings={() => setSettingsOpen(true)} onClose={() => onOpenChange(false)} />
  );
  const settings = <AiSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />;

  if (layoutMode === 'desktop') {
    if (!open) return settings;
    return (
      <>
      {settings}
      <aside
        aria-label="Assistente de IA"
        className="fixed bottom-4 right-4 z-40 flex h-[min(640px,calc(100dvh-6rem))] w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-2xl"
      >
        {content}
      </aside>
      </>
    );
  }

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
