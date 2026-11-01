import { useMemo } from 'react';
import { useT } from '@/hooks/use-t';
import { toDiffRows, type DiffSegment } from '@/lib/diff/word-diff';

/**
 * Texto com as alterações marcadas: inserido em verde sublinhado, removido em
 * vermelho riscado (as mesmas cores do diff visual). Linhas sem mudança longe
 * das alterações ficam recolhidas.
 */
export function DiffView({ segments, showLineNumbers = true }: { segments: readonly DiffSegment[]; showLineNumbers?: boolean }) {
  const { t } = useT();
  const rows = useMemo(() => toDiffRows(segments), [segments]);
  return (
    <div className="overflow-x-auto font-mono text-xs leading-5">
      {rows.map((row, index) =>
        row.kind === 'skip' ? (
          <div key={index} className="select-none bg-muted/50 px-2 py-0.5 text-muted-foreground">
            {row.count === 1 ? t('1 linha sem alteração') : t('{count} linhas sem alteração', { count: row.count })}
          </div>
        ) : (
          <div key={index} className="flex min-w-0">
            {showLineNumbers && (
              <span className="w-10 shrink-0 select-none pr-2 text-right text-muted-foreground">{row.number ?? ''}</span>
            )}
            <span className="min-w-0 flex-1 whitespace-pre-wrap break-words pr-2">
              {row.parts.length === 0
                ? ' '
                : row.parts.map((part, partIndex) =>
                    part.op === 'insert' ? (
                      <ins key={partIndex} className="bg-diff-added-bg text-diff-added decoration-diff-added">
                        {part.text}
                      </ins>
                    ) : part.op === 'delete' ? (
                      <del key={partIndex} className="bg-diff-removed-bg text-diff-removed decoration-diff-removed">
                        {part.text}
                      </del>
                    ) : (
                      <span key={partIndex}>{part.text}</span>
                    ),
                  )}
            </span>
          </div>
        ),
      )}
    </div>
  );
}
