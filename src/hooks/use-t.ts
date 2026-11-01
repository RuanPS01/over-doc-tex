import { useSyncExternalStore } from 'react';
import { getLocale, subscribeLocale, t, type Locale } from '@/lib/i18n';

/**
 * Tradução em componentes: re-renderiza quando o idioma muda. `t` é a mesma
 * função de '@/lib/i18n' (lê o idioma na hora); o hook só garante o redesenho.
 */
export function useT(): { t: typeof t; locale: Locale } {
  const locale = useSyncExternalStore(subscribeLocale, getLocale, () => 'pt-BR' as const);
  return { t, locale };
}
