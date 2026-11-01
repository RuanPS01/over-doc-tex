import { useT } from '@/hooks/use-t';
import type { AiStructuredResult, OutlineProposal, ReferenceAudit } from '@/lib/ai/schemas';
import { msg } from '@/lib/i18n';
import { cn } from '@/lib/utils';

const VERDICT_LABEL: Record<ReferenceAudit['results'][number]['verdict'], string> = {
  matches: msg('Confere'),
  mismatch: msg('Não confere'),
  unreachable: msg('Inacessível'),
  uncertain: msg('Incerto'),
};

const VERDICT_STYLE: Record<ReferenceAudit['results'][number]['verdict'], string> = {
  matches: 'bg-success/15 text-success',
  mismatch: 'bg-destructive/15 text-destructive',
  unreachable: 'bg-destructive/15 text-destructive',
  uncertain: 'bg-warning/20 text-warning-foreground',
};

function ReferenceAuditView({ audit }: { audit: ReferenceAudit }) {
  const { t } = useT();
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        {t('{ok} conferem, {problems} com problema, {uncertain} incertas', {
          ok: audit.summary.ok,
          problems: audit.summary.problems,
          uncertain: audit.summary.uncertain,
        })}
      </p>
      <ul className="flex flex-col gap-2">
        {audit.results.map((item) => (
          <li key={item.key} className="rounded-md border p-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate font-mono">{item.key}</span>
              <span className={cn('shrink-0 rounded px-1.5 py-0.5 font-medium', VERDICT_STYLE[item.verdict])}>
                {t(VERDICT_LABEL[item.verdict])}
              </span>
            </div>
            {item.url && <p className="mt-1 truncate text-muted-foreground">{item.url}</p>}
            <p className="mt-1">{item.explanation}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function OutlineView({ proposal }: { proposal: OutlineProposal }) {
  return (
    <div className="flex flex-col gap-2 text-xs">
      <p className="text-sm">{proposal.summary}</p>
      <ol className="flex flex-col gap-1">
        {proposal.sections.map((section, index) => (
          <li key={`${section.title}-${index}`} className="flex min-w-0 items-start gap-2">
            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-medium">{section.action}</span>
            <span className="min-w-0">
              <strong className="font-semibold">{section.title}</strong>
              <span className="text-muted-foreground"> ({section.level}) {section.rationale}</span>
            </span>
          </li>
        ))}
      </ol>
      <pre className="max-w-full overflow-x-auto rounded-md bg-muted p-3 font-mono">{proposal.latex}</pre>
    </div>
  );
}

/** Renderização das saídas estruturadas (já validadas por Zod no backend e no cliente). */
export function StructuredResultView({ result }: { result: AiStructuredResult }) {
  switch (result.task) {
    case 'checkReferences':
      return <ReferenceAuditView audit={result.data} />;
    case 'reorganizeTopics':
    case 'updateToc':
      return <OutlineView proposal={result.data} />;
  }
}
