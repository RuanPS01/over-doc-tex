import { Check, Pencil, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { MarkdownContent } from '@/components/common/markdown-content';
import { Button } from '@/components/ui/button';
import { useT } from '@/hooks/use-t';
import { isCommentAuthor, type CommentSummary, type ReviewViewer } from '../model/review';
import { CommentComposer } from './comment-composer';

interface ThreadCommentsProps {
  comments: readonly CommentSummary[];
  /** Sem ele, a lista é só leitura (rodada anterior, revisão encerrada). */
  viewer?: ReviewViewer;
  /** Texto novo e o anterior (o desfazer volta para ele). */
  onEdit?: (commentId: string, body: string, previous: string) => Promise<unknown>;
  /** Exclui uma resposta (o texto vai junto para o desfazer). O primeiro comentário sai com a thread inteira, pelo menu do cartão. */
  onDelete?: (commentId: string, body: string) => Promise<unknown>;
}

/**
 * Comentários de uma thread. Quem escreveu edita o próprio texto e exclui as
 * próprias respostas (fica "Comentário excluído" no lugar, para a conversa
 * continuar fazendo sentido).
 */
export function ThreadComments({ comments, viewer, onEdit, onDelete }: ThreadCommentsProps) {
  const { t, locale } = useT();
  const timeFormat = useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }), [locale]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const remove = async (commentId: string, body: string) => {
    setError(null);
    try {
      await onDelete?.(commentId, body);
      setConfirmDeleteId(null);
    } catch {
      setError(t('Não foi possível excluir. Confira a conexão e tente de novo.'));
    }
  };

  return (
    <>
      {comments.map((comment, index) => {
        const isOwn = Boolean(viewer) && !comment.isDeleted && isCommentAuthor(comment, viewer!);
        const canEdit = isOwn && Boolean(onEdit);
        const canDelete = isOwn && Boolean(onDelete) && index > 0;
        return (
          <li key={comment.id} className="group flex flex-col gap-0.5">
            <div className="flex min-w-0 items-start gap-1">
              {/* Quebra em vez de cortar: os botões ao lado ocupam espaço mesmo invisíveis, e "editado" não pode sumir. */}
              <p className="min-w-0 flex-1 break-words py-1 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{comment.authorName}</span>
                {comment.authorRole === 'reviewer' ? ` ${t('(revisor)')}` : ''}
                {comment.createdAt ? ` · ${timeFormat.format(comment.createdAt)}` : ''}
                {comment.editedAt && !comment.isDeleted ? ` · ${t('editado')}` : ''}
              </p>
              {editingId !== comment.id && (canEdit || canDelete) && (
                // Visíveis no hover (e sempre em telas de toque), como as ações por arquivo da árvore.
                <span className="flex shrink-0 items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
                  {canEdit && (
                    <Button variant="ghost" size="icon" className="size-7" aria-label={t('Editar comentário')} title={t('Editar comentário')} onClick={() => setEditingId(comment.id)}>
                      <Pencil className="size-3.5" />
                    </Button>
                  )}
                  {canDelete && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-destructive"
                      aria-label={t('Excluir resposta')}
                      title={t('Excluir resposta')}
                      onClick={() => setConfirmDeleteId(comment.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                </span>
              )}
            </div>
            {comment.isDeleted ? (
              <p className="text-sm italic text-muted-foreground">{t('Comentário excluído.')}</p>
            ) : editingId === comment.id ? (
              <CommentComposer
                autoFocus
                initialValue={comment.body}
                placeholder={t('Editar comentário')}
                submitLabel={t('Salvar')}
                submitIcon={<Check />}
                onSubmit={async (body) => {
                  if (body !== comment.body) await onEdit?.(comment.id, body, comment.body);
                  setEditingId(null);
                }}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <MarkdownContent markdown={comment.body} className="[&_p]:my-0.5" />
            )}
            {confirmDeleteId === comment.id && (
              <div role="alertdialog" aria-label={t('Excluir resposta')} className="mt-1 flex flex-wrap items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs">
                <span className="min-w-0 flex-1">{t('Excluir esta resposta?')}</span>
                <Button variant="ghost" size="sm" className="h-7" onClick={() => setConfirmDeleteId(null)}>
                  {t('Cancelar')}
                </Button>
                <Button variant="destructive" size="sm" className="h-7" onClick={() => void remove(comment.id, comment.body)}>
                  <Trash2 />
                  {t('Excluir')}
                </Button>
              </div>
            )}
            {error && confirmDeleteId === comment.id && <p className="text-xs text-destructive">{error}</p>}
          </li>
        );
      })}
    </>
  );
}
