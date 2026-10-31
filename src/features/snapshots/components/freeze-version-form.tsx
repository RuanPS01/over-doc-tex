import { Loader2, Snowflake } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { TexIssue } from '@/lib/latex/prepare';
import { useFreezeSnapshot, FreezeError, type FreezeStage } from '../hooks/use-freeze-snapshot';
import { MAX_VERSION_MESSAGE, nextVersion, versionLabel, type VersionBump, type VersionNumber } from '../model/version';
import { IssueList } from './issue-list';

export const FREEZE_STAGE_LABELS: Record<FreezeStage, string> = {
  compiling: 'Compilando a versão',
  uploading: 'Guardando o código e o PDF',
  freezing: 'Congelando',
};

interface FreezeVersionFormProps {
  projectId: string;
  projectName: string;
  latest: VersionNumber | null;
  onFrozen: (label: string) => void;
  onIssueSelect?: (issue: TexIssue) => void;
}

/** Congela o projeto como está na tela, com uma descrição opcional. */
export function FreezeVersionForm({ projectId, projectName, latest, onFrozen, onIssueSelect }: FreezeVersionFormProps) {
  const freeze = useFreezeSnapshot(projectId, projectName);
  const [message, setMessage] = useState('');
  const [bump, setBump] = useState<VersionBump>('minor');
  const [stage, setStage] = useState<FreezeStage | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<TexIssue[]>([]);
  const next = versionLabel(nextVersion(latest, bump));

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setIsBusy(true);
    setError(null);
    setIssues([]);
    try {
      const result = await freeze({ message, bump, reuseIfUnchanged: false, onStage: setStage });
      setMessage('');
      onFrozen(result.label);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      if (caught instanceof FreezeError) setIssues(caught.issues);
    } finally {
      setIsBusy(false);
      setStage(null);
    }
  };

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-2 rounded-lg border bg-card p-3">
      <label htmlFor="version-message" className="text-sm font-medium">
        Nova versão
      </label>
      <Input
        id="version-message"
        value={message}
        maxLength={MAX_VERSION_MESSAGE}
        disabled={isBusy}
        placeholder="O que mudou (opcional)"
        onChange={(event) => setMessage(event.target.value)}
      />
      {latest && (
        <div role="radiogroup" aria-label="Tipo de versão" className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1 text-xs">
          {(['minor', 'major'] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={bump === option}
              disabled={isBusy}
              onClick={() => setBump(option)}
              className={
                bump === option
                  ? 'rounded bg-background px-2 py-1 font-medium shadow-sm'
                  : 'rounded px-2 py-1 text-muted-foreground hover:text-foreground'
              }
            >
              {option === 'minor' ? `Ajuste (${versionLabel(nextVersion(latest, 'minor'))})` : `Principal (${versionLabel(nextVersion(latest, 'major'))})`}
            </button>
          ))}
        </div>
      )}
      <Button type="submit" disabled={isBusy}>
        {isBusy ? <Loader2 className="animate-spin" /> : <Snowflake />}
        {isBusy && stage ? FREEZE_STAGE_LABELS[stage] : `Congelar versão ${next}`}
      </Button>
      <p className="text-xs text-muted-foreground">
        Guarda uma cópia imutável do código e do PDF. A edição continua normalmente.
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <IssueList issues={issues} onSelect={onIssueSelect} />
    </form>
  );
}
