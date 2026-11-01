import { describe, expect, it } from 'vitest';
import { isThemePreference, resolveTheme, THEME_OPTIONS } from '@/lib/theme';

describe('tema', () => {
  it('escolha explícita vale sobre o sistema; "sistema" segue o aparelho', () => {
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });

  it('só aceita as três preferências (valor estranho no armazenamento cai em sistema)', () => {
    expect(THEME_OPTIONS.map((option) => option.value)).toEqual(['light', 'dark', 'system']);
    expect(isThemePreference('dark')).toBe(true);
    expect(isThemePreference('azul')).toBe(false);
    expect(isThemePreference(null)).toBe(false);
  });
});
