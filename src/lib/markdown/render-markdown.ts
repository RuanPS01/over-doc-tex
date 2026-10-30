import DOMPurify from 'dompurify';
import { marked } from 'marked';

// Links gerados pela IA sempre abrem em nova aba e sem acesso ao opener.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer nofollow');
  }
});

/**
 * Converte Markdown em HTML seguro. É a ÚNICA origem de HTML aceita por
 * `dangerouslySetInnerHTML` no projeto (ver docs/00-regras-para-ia.md).
 */
export function renderMarkdown(markdown: string): string {
  const html = marked.parse(markdown, { async: false, gfm: true });
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'iframe', 'form', 'input', 'img'],
    FORBID_ATTR: ['style'],
  });
}
