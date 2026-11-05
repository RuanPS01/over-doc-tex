import { Loader2, Send } from 'lucide-react';
import { useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useT } from '@/hooks/use-t';
import { MAX_COMMENT_LENGTH } from '../model/review';

interface CommentComposerProps {
  placeholder: string;
  submitLabel: string;
  autoFocus?: boolean;
  /** Texto já escrito (edição de um comentário). */
  initialValue?: string;
  submitIcon?: ReactNode;
  onSubmit: (body: string) => Promise<unknown>;
  onCancel?: () => void;
}

/** Caixa de comentário: Enter envia, Shift+Enter quebra a linha, Esc cancela (quando dá para cancelar). */
export function CommentComposer({ placeholder, submitLabel, autoFocus, initialValue = '', submitIcon, onSubmit, onCancel }: CommentComposerProps) {
  const { t } = useT();
  const [body, setBody] = useState(initialValue);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    const text = body.trim();
    if (!text || isSending) return;
    setIsSending(true);
    setError(null);
    try {
      await onSubmit(text);
      setBody('');
    } catch {
      setError(t('Não foi possível enviar. Confira a conexão e tente de novo.'));
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void submit();
    } else if (event.key === 'Escape' && onCancel) {
      event.preventDefault();
      onCancel();
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-2">
      <Textarea
        value={body}
        rows={2}
        autoFocus={autoFocus}
        maxLength={MAX_COMMENT_LENGTH}
        placeholder={placeholder}
        aria-label={placeholder}
        className="max-h-40 resize-none text-sm"
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={handleKeyDown}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" disabled={isSending} onClick={onCancel}>
            {t('Cancelar')}
          </Button>
        )}
        <Button type="submit" size="sm" disabled={!body.trim() || isSending}>
          {isSending ? <Loader2 className="animate-spin" /> : (submitIcon ?? <Send />)}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
