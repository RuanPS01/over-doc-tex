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
import { useThemePreference } from '@/hooks/use-theme';
import { isThemePreference, THEME_OPTIONS, type ThemePreference } from '@/lib/theme';
import { cn } from '@/lib/utils';

const ICONS: Record<ThemePreference, typeof Sun> = { light: Sun, dark: Moon, system: Monitor };
const LABELS: Record<ThemePreference, string> = { light: 'claro', dark: 'escuro', system: 'padrão do sistema' };

/** Opções de tema para dentro de outro menu (ex.: "Mais ações" do editor no celular). */
export function ThemeMenuItems({ className }: { className?: string }) {
  const { preference, setPreference } = useThemePreference();
  return (
    <DropdownMenuGroup className={className}>
      <DropdownMenuLabel>Tema</DropdownMenuLabel>
      <DropdownMenuRadioGroup value={preference} onValueChange={(value) => isThemePreference(value) && setPreference(value)}>
        {THEME_OPTIONS.map((option) => {
          const Icon = ICONS[option.value];
          return (
            <DropdownMenuRadioItem key={option.value} value={option.value} className="gap-2 [&_svg]:size-4">
              <Icon className="text-muted-foreground" />
              {option.label}
            </DropdownMenuRadioItem>
          );
        })}
      </DropdownMenuRadioGroup>
    </DropdownMenuGroup>
  );
}

/** Botão do cabeçalho com o ícone do tema atual: claro, escuro ou o do sistema. */
export function ThemeMenu({ className }: { className?: string }) {
  const { preference } = useThemePreference();
  const Icon = ICONS[preference];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className={cn('shrink-0', className)} aria-label={`Tema: ${LABELS[preference]}`} title="Tema">
          <Icon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <ThemeMenuItems />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
