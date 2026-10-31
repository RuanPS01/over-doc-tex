import { AlertTriangle, CircleX } from 'lucide-react';
import type { TexIssue } from '@/lib/latex/prepare';
import { cn } from '@/lib/utils';

/** Erros do TeX que impediram congelar a versão, com arquivo e linha. */
export function IssueList({ issues, onSelect }: { issues: readonly TexIssue[]; onSelect?: (issue: TexIssue) => void }) {
  if (issues.length === 0) return null;
  return (
    <ul className="max-h-48 overflow-y-auto rounded-md border text-xs">
      {issues.map((issue, index) => {
        const Icon = issue.kind === 'warning' ? AlertTriangle : CircleX;
        const location = issue.file ? `${issue.file}${issue.line ? `:${issue.line}` : ''}` : null;
        return (
          <li key={index}>
            <button
              type="button"
              disabled={!onSelect || !issue.file}
              onClick={() => onSelect?.(issue)}
              className="flex w-full min-w-0 items-start gap-2 px-2 py-1.5 text-left hover:bg-muted disabled:cursor-default disabled:hover:bg-transparent"
            >
              <Icon className={cn('mt-0.5 size-3.5 shrink-0', issue.kind === 'warning' ? 'text-warning' : 'text-destructive')} />
              <span className="min-w-0 flex-1 break-words">{issue.message}</span>
              {location && <span className="max-w-[45%] shrink-0 truncate font-mono text-muted-foreground">{location}</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
