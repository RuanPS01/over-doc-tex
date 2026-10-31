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
  isStreaming: boolean;
  onSend: (input: { task: AiTask; prompt: string }) => void;
  onStop: () => void;
}

export function AiComposer({ isStreaming, onSend, onStop }: AiComposerProps) {
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
    <form onSubmit={submit} className="flex shrink-0 flex-col gap-2 border-t p-3">
      <Textarea
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Pergunte qualquer coisa sobre o documento"
        rows={2}
        className="max-h-40 resize-none"
        aria-label="Mensagem para o assistente"
      />
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="min-w-0">
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
          <Button type="button" size="icon" variant="secondary" aria-label="Parar" onClick={onStop}>
            <Square />
          </Button>
        ) : (
          <Button type="submit" size="icon" aria-label="Enviar" disabled={!prompt.trim()}>
            <ArrowUp />
          </Button>
        )}
      </div>
    </form>
  );
}
