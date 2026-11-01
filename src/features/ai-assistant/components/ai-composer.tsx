import { ArrowUp, ChevronDown, Square } from 'lucide-react';
import { useState, type FormEvent, type KeyboardEvent } from 'react';
import type { AiTask } from '@/lib/ai/schemas';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { Textarea } from '@/components/ui/textarea';

export const TASK_LABELS: Record<AiTask, string> = {
  chat: 'Perguntar',
  rewriteText: 'Reescrever',
  paraphrase: 'Parafrasear',
  generateDraft: 'Gerar rascunho',
  reorganizeTopics: 'Reorganizar tópicos',
  updateToc: 'Atualizar sumário',
  checkReferences: 'Verificar referências',
};

interface AiComposerProps {
  /** Assistente encaixado no rodapé: campo de uma linha e menos espaço. */
  compact?: boolean;
  isStreaming: boolean;
  onSend: (input: { task: AiTask; prompt: string }) => void;
  onStop: () => void;
}

export function AiComposer({ compact = false, isStreaming, onSend, onStop }: AiComposerProps) {
  const [task, setTask] = useState<AiTask>('chat');
  const [prompt, setPrompt] = useState('');

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed || isStreaming) return;
    onSend({ task, prompt: trimmed });
    setPrompt('');
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <form onSubmit={submit} className={cn('flex shrink-0 flex-col border-t', compact ? 'gap-1.5 p-2' : 'gap-2 p-3')}>
      <Textarea
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Pergunte qualquer coisa sobre o documento"
        rows={compact ? 1 : 2}
        className={cn('resize-none', compact ? 'max-h-28 min-h-9 py-1.5 text-sm' : 'max-h-40')}
        aria-label="Mensagem para o assistente"
      />
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="sm" className={cn('min-w-0', compact && 'h-8 text-xs')}>
              <span className="truncate">{TASK_LABELS[task]}</span>
              <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top">
            {(Object.keys(TASK_LABELS) as AiTask[]).map((option) => (
              <DropdownMenuItem key={option} onSelect={() => setTask(option)}>
                {TASK_LABELS[option]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <span className="flex-1" />
        {isStreaming ? (
          <Button type="button" size="icon" variant="secondary" className={cn(compact && 'size-8')} aria-label="Parar" onClick={onStop}>
            <Square />
          </Button>
        ) : (
          <Button type="submit" size="icon" className={cn(compact && 'size-8')} aria-label="Enviar" disabled={!prompt.trim()}>
            <ArrowUp />
          </Button>
        )}
      </div>
    </form>
  );
}
