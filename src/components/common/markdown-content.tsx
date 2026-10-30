import { useMemo } from 'react';
import { renderMarkdown } from '@/lib/markdown/render-markdown';
import { cn } from '@/lib/utils';

/**
 * Renderiza Markdown sanitizado (marked + DOMPurify). Único componente do
 * projeto autorizado a usar `dangerouslySetInnerHTML`.
 */
export function MarkdownContent({ markdown, className }: { markdown: string; className?: string }) {
  const html = useMemo(() => renderMarkdown(markdown), [markdown]);
  return (
    <div
      className={cn(
        'min-w-0 break-words text-sm leading-relaxed',
        '[&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5',
        '[&_a]:text-primary [&_a]:underline [&_strong]:font-semibold',
        '[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-xs',
        '[&_pre]:my-2 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3',
        '[&_pre_code]:bg-transparent [&_pre_code]:p-0',
        className,
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
