import { Monitor, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useT } from '@/hooks/use-t';
import { useThemePreference } from '@/hooks/use-theme';
import { msg } from '@/lib/i18n';
import { isThemePreference, THEME_OPTIONS, type ThemePreference } from '@/lib/theme';
import { cn } from '@/lib/utils';

const ICONS: Record<ThemePreference, typeof Sun> = { light: Sun, dark: Moon, system: Monitor };
const LABELS: Record<ThemePreference, string> = { light: msg('Tema: claro'), dark: msg('Tema: escuro'), system: msg('Tema: padrão do sistema') };

/** Opções de tema para dentro de outro menu (ex.: "Mais ações" do editor no celular). */
export function ThemeMenuItems({ className }: { className?: string }) {
  const { t } = useT();
  const { preference, setPreference } = useThemePreference();
  return (
    <DropdownMenuGroup className={className}>
      <DropdownMenuLabel>{t('Tema')}</DropdownMenuLabel>
      <DropdownMenuRadioGroup value={preference} onValueChange={(value) => isThemePreference(value) && setPreference(value)}>
        {THEME_OPTIONS.map((option) => {
          const Icon = ICONS[option.value];
          return (
            <DropdownMenuRadioItem key={option.value} value={option.value} className="gap-2 [&_svg]:size-4">
              <Icon className="text-muted-foreground" />
              {t(option.label)}
            </DropdownMenuRadioItem>
          );
        })}
      </DropdownMenuRadioGroup>
    </DropdownMenuGroup>
  );
}

/** Botão do cabeçalho com o ícone do tema atual: claro, escuro ou o do sistema. */
export function ThemeMenu({ className }: { className?: string }) {
  const { t } = useT();
  const { preference } = useThemePreference();
  const Icon = ICONS[preference];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className={cn('shrink-0', className)} aria-label={t(LABELS[preference])} title={t('Tema')}>
          <Icon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <ThemeMenuItems />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
