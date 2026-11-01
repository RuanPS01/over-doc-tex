/**
 * Idioma da interface: português (Brasil), inglês ou espanhol. Sem escolha
 * manual, segue o idioma principal do sistema; se ele não for um dos três,
 * fica em inglês. A escolha fica no localStorage deste navegador e vira o
 * `lang` do <html>. O index.html aplica a mesma regra antes do primeiro
 * desenho; a chave e os valores precisam continuar iguais aos de lá.
 */

export type Locale = 'pt-BR' | 'en' | 'es';
export type LocalePreference = Locale | 'system';

export const LOCALE_STORAGE_KEY = 'overdoctex.locale';

/** Rótulos no próprio idioma: quem não lê o idioma atual ainda acha o seu. */
export const LOCALE_OPTIONS: readonly { value: Locale; label: string; short: string }[] = [
  { value: 'pt-BR', label: 'Português (Brasil)', short: 'PT' },
  { value: 'en', label: 'English', short: 'EN' },
  { value: 'es', label: 'Español', short: 'ES' },
];

export function isLocalePreference(value: unknown): value is LocalePreference {
  return value === 'system' || LOCALE_OPTIONS.some((option) => option.value === value);
}

/** Idioma principal do sistema convertido para um dos três; fora deles, inglês. */
export function detectLocale(primaryLanguage: string | undefined): Locale {
  const language = (primaryLanguage ?? '').toLowerCase();
  if (language.startsWith('pt')) return 'pt-BR';
  if (language.startsWith('es')) return 'es';
  return 'en';
}

const hasWindow = typeof window !== 'undefined';
const listeners = new Set<() => void>();

function readPreference(): LocalePreference {
  try {
    const stored = hasWindow ? window.localStorage.getItem(LOCALE_STORAGE_KEY) : null;
    return isLocalePreference(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

let preference: LocalePreference = readPreference();

const systemLanguage = () => (hasWindow ? (window.navigator.languages?.[0] ?? window.navigator.language) : undefined);

/** Idioma em uso. Fora do navegador (testes, scripts), português: é o idioma do código. */
export function getLocale(): Locale {
  if (!hasWindow) return 'pt-BR';
  return preference === 'system' ? detectLocale(systemLanguage()) : preference;
}

export function getLocalePreference(): LocalePreference {
  return preference;
}

function apply(): void {
  if (hasWindow) document.documentElement.lang = getLocale();
}

export function setLocalePreference(next: LocalePreference): void {
  preference = next;
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
  } catch {
    // Sem onde guardar: vale só nesta aba.
  }
  apply();
  listeners.forEach((listener) => listener());
}

export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

if (hasWindow) {
  window.addEventListener('languagechange', () => {
    if (preference !== 'system') return;
    apply();
    listeners.forEach((listener) => listener());
  });
}

export function initLocale(): void {
  apply();
}
