import { Loader2, Snowflake } from 'lucide-react';
import type { VersionBump } from '@/features/snapshots/model/version';
import { useT } from '@/hooks/use-t';
import { cn } from '@/lib/utils';

interface ReviewVersionNoticeProps {
  /** Próximo número de cada tipo (ajuste 1.3, principal 2.0). */
  labels: Record<VersionBump, string>;
  /** Primeira versão do projeto: é sempre 1.0, sem escolha. */
  isFirst: boolean;
  isLoading: boolean;
  bump: VersionBump;
  disabled?: boolean;
  onBumpChange: (bump: VersionBump) => void;
}

/**
 * Aviso de "Solicitar revisão": o projeto como está agora vira uma versão
 * congelada (com o número que ela vai ter), e é essa versão que os revisores
 * veem. Cada revisão nova congela uma versão.
 */
export function ReviewVersionNotice({ labels, isFirst, isLoading, bump, disabled, onBumpChange }: ReviewVersionNoticeProps) {
  const { t } = useT();
  const version = labels[isFirst ? 'minor' : bump];
  return (
    <section aria-label={t('Versão congelada para a revisão')} className="flex flex-col gap-2 rounded-md border bg-muted/40 p-3 text-sm">
      <p className="flex items-center gap-2 font-medium">
        {isLoading ? <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden /> : <Snowflake className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
        {isLoading ? t('Conferindo o número da versão') : t('A versão {version} será congelada para esta revisão', { version })}
      </p>
      <p className="text-xs text-muted-foreground">
        {t('O projeto como está agora vira uma cópia imutável, e é ela que os revisores veem. Cada revisão nova congela uma versão; a edição continua normalmente.')}
      </p>
      {!isFirst && !isLoading && (
        <div role="radiogroup" aria-label={t('Tipo de versão')} className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1 text-xs">
          {(['minor', 'major'] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={bump === option}
              disabled={disabled}
              onClick={() => onBumpChange(option)}
              className={cn(
                'min-w-0 truncate rounded px-2 py-1',
                bump === option ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {option === 'minor' ? t('Ajuste ({version})', { version: labels.minor }) : t('Principal ({version})', { version: labels.major })}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
