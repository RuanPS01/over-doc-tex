import { Languages } from 'lucide-react';
import { useSyncExternalStore } from 'react';
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
import { getLocalePreference, LOCALE_OPTIONS, setLocalePreference, subscribeLocale, type LocalePreference } from '@/lib/i18n';
import { cn } from '@/lib/utils';

const SYSTEM = 'system';

function useLocalePreference(): LocalePreference {
  return useSyncExternalStore(subscribeLocale, getLocalePreference, () => SYSTEM);
}

/**
 * Opções de idioma para dentro de outro menu. `translate="no"`: a tradução
 * automática do navegador não reescreve os nomes dos idiomas, que ficam
 * sempre no próprio idioma ("English", "Español").
 */
export function LanguageMenuItems({ className }: { className?: string }) {
  const { t } = useT();
  const preference = useLocalePreference();
  return (
    <DropdownMenuGroup className={cn('notranslate', className)} translate="no">
      <DropdownMenuLabel>{t('Idioma')}</DropdownMenuLabel>
      <DropdownMenuRadioGroup
        value={preference}
        onValueChange={(value) => {
          if (value === SYSTEM || LOCALE_OPTIONS.some((option) => option.value === value)) setLocalePreference(value as LocalePreference);
        }}
      >
        {LOCALE_OPTIONS.map((option) => (
          <DropdownMenuRadioItem key={option.value} value={option.value} lang={option.value}>
            {option.label}
          </DropdownMenuRadioItem>
        ))}
        <DropdownMenuRadioItem value={SYSTEM}>{t('Idioma do sistema')}</DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
    </DropdownMenuGroup>
  );
}

/** Botão do cabeçalho com a sigla do idioma atual (PT, EN, ES). */
export function LanguageMenu({ className }: { className?: string }) {
  const { t, locale } = useT();
  const current = LOCALE_OPTIONS.find((option) => option.value === locale) ?? LOCALE_OPTIONS[0]!;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          translate="no"
          className={cn('notranslate shrink-0 gap-1 px-2', className)}
          aria-label={t('Idioma: {language}', { language: current.label })}
          title={t('Idioma')}
        >
          <Languages />
          <span className="text-xs font-semibold">{current.short}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="notranslate" translate="no">
        <LanguageMenuItems />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
