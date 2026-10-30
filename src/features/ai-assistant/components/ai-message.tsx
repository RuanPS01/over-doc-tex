import { AlertCircle, Loader2 } from 'lucide-react';
import { MarkdownContent } from '@/components/common/markdown-content';
import { cn } from '@/lib/utils';
import type { AiChatMessage } from '../hooks/use-ai-stream';
import { StructuredResultView } from './structured-result-view';

export function AiMessage({ message }: { message: AiChatMessage }) {
  if (message.role === 'user') {
    return (
      <div className="ml-8 self-end rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">
        <p className="whitespace-pre-wrap break-words">{message.text}</p>
      </div>
    );
  }

  return (
    <div className={cn('flex min-w-0 flex-col gap-2', message.status === 'aborted' && 'opacity-70')}>
      {message.stage && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          {message.stage}
        </p>
      )}
      {message.text && <MarkdownContent markdown={message.text} />}
      {message.result && <StructuredResultView result={message.result} />}
      {message.sources.length > 0 && message.status === 'complete' && (
        <p className="truncate text-[11px] text-muted-foreground">
          Fontes: {message.sources.map((source) => `${source.path}:${source.startLine}`).join(', ')}
        </p>
      )}
      {message.error && (
        <p className="flex items-start gap-2 rounded-md bg-destructive/10 p-2 text-xs text-destructive">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
          {message.error}
        </p>
      )}
    </div>
  );
}
