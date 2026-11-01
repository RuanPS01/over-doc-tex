/**
 * Tema da interface: claro, escuro ou o do sistema (padrão). A escolha fica
 * no localStorage deste navegador e vira a classe `dark` no <html>, que os
 * tokens de globals.css leem. O index.html aplica a mesma regra antes do
 * primeiro desenho da página (sem piscar); a chave e os valores precisam
 * continuar iguais aos de lá.
 */

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'overdoctex.theme';

export const THEME_OPTIONS: readonly { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Escuro' },
  { value: 'system', label: 'Padrão do sistema' },
];

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

/** Tema efetivo: a escolha explícita ou, em "sistema", o que o aparelho pede. */
export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  if (preference === 'system') return systemPrefersDark ? 'dark' : 'light';
  return preference;
}

const listeners = new Set<() => void>();
const hasWindow = typeof window !== 'undefined';
const media = hasWindow ? window.matchMedia('(prefers-color-scheme: dark)') : null;

function readPreference(): ThemePreference {
  try {
    const stored = hasWindow ? window.localStorage.getItem(THEME_STORAGE_KEY) : null;
    return isThemePreference(stored) ? stored : 'system';
  } catch {
    // Armazenamento bloqueado (aba anônima): segue o sistema.
    return 'system';
  }
}

let preference: ThemePreference = readPreference();

/**
 * Cor da barra do navegador no celular. O index.html traz uma meta por tema
 * (com media); a cor de cada uma é lida de lá uma vez, antes de qualquer troca.
 */
const metaColors = new Map<HTMLMetaElement, { light: string; dark: string; natural: string }>();

function themeMetas(): Map<HTMLMetaElement, { light: string; dark: string; natural: string }> {
  if (metaColors.size > 0) return metaColors;
  const metas = [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')];
  const colorFor = (theme: ResolvedTheme) => metas.find((meta) => (meta.getAttribute('media') ?? '').includes(theme))?.content ?? '';
  const light = colorFor('light');
  const dark = colorFor('dark');
  for (const meta of metas) metaColors.set(meta, { light, dark, natural: meta.content });
  return metaColors;
}

function applyTheme(): void {
  if (!hasWindow) return;
  const resolved = resolveTheme(preference, media?.matches ?? false);
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  // Barras de rolagem e controles nativos acompanham o tema escolhido.
  root.style.colorScheme = resolved;
  // As metas seguem o sistema; com escolha explícita, as duas passam a ter a cor do tema.
  for (const [meta, colors] of themeMetas()) {
    const color = preference === 'system' ? colors.natural : colors[resolved];
    if (color) meta.content = color;
  }
}

media?.addEventListener('change', () => {
  if (preference !== 'system') return;
  applyTheme();
  listeners.forEach((listener) => listener());
});

export function getThemePreference(): ThemePreference {
  return preference;
}

export function setThemePreference(next: ThemePreference): void {
  preference = next;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // Sem onde guardar: vale só nesta aba.
  }
  applyTheme();
  listeners.forEach((listener) => listener());
}

export function subscribeThemePreference(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Garante a classe certa no <html> ao iniciar o app (o script do index.html já fez o mesmo antes). */
export function initTheme(): void {
  applyTheme();
}
