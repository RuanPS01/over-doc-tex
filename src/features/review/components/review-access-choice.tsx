import { Link2, Mail } from 'lucide-react';
import type { ReviewAccess } from '@shared/firestore/types';
import { useT } from '@/hooks/use-t';
import { msg } from '@/lib/i18n';
import { cn } from '@/lib/utils';

const OPTIONS: ReadonlyArray<{ value: ReviewAccess; title: string; description: string; icon: typeof Mail }> = [
  {
    value: 'email',
    title: msg('Só os e-mails convidados'),
    description: msg('Cada pessoa entra com o e-mail convidado (link de acesso, Google ou senha).'),
    icon: Mail,
  },
  {
    value: 'link',
    title: msg('Qualquer pessoa com o link'),
    description: msg('Sem conta: a pessoa informa o nome. O mesmo nome em outro aparelho continua como o mesmo revisor.'),
    icon: Link2,
  },
];

/** Quem pode abrir a revisão: os e-mails convidados (com login) ou qualquer pessoa com o link. */
export function ReviewAccessChoice({ value, disabled, onChange }: { value: ReviewAccess; disabled?: boolean; onChange: (access: ReviewAccess) => void }) {
  const { t } = useT();
  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="mb-1 text-sm font-medium">{t('Quem pode abrir a revisão')}</legend>
      {OPTIONS.map((option) => {
        const Icon = option.icon;
        const checked = value === option.value;
        return (
          <label
            key={option.value}
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm transition-colors hover:bg-muted has-[:disabled]:cursor-default has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
              checked && 'border-primary bg-muted/60',
            )}
          >
            <input type="radio" name="review-access" className="mt-1 size-4 shrink-0 accent-primary" checked={checked} onChange={() => onChange(option.value)} />
            <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="font-medium">{t(option.title)}</span>
              <span className="text-xs text-muted-foreground">{t(option.description)}</span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
