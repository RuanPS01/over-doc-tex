import { useSyncExternalStore } from 'react';
import { getThemePreference, setThemePreference, subscribeThemePreference, type ThemePreference } from '@/lib/theme';

/** Preferência de tema (claro, escuro ou sistema) e como trocá-la. */
export function useThemePreference(): { preference: ThemePreference; setPreference: (preference: ThemePreference) => void } {
  const preference = useSyncExternalStore(subscribeThemePreference, getThemePreference, () => 'system' as const);
  return { preference, setPreference: setThemePreference };
}
