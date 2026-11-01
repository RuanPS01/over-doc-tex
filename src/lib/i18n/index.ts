/**
 * Tradução da interface. O texto em português é a chave (como no gettext):
 * `t('Compilar')` devolve "Compile" em inglês e "Compilar" em espanhol. Os
 * dicionários ficam em ./messages/{en,es}/<área>.ts; tests/unit/i18n.test.ts
 * confere que toda chave usada no código tem tradução nos dois.
 *
 * Regras para quem escreve código:
 * - a chave é sempre uma string literal (aspas simples ou duplas), nunca
 *   variável nem template string, para o teste conseguir achá-la;
 * - partes variáveis vão como {nome}: t('Revisão #{number} aberta', { number });
 * - constantes fora de componentes usam msg('...') (só marca a chave) e são
 *   traduzidas na hora de mostrar: t(LABELS[status]).
 */
import { getLocale } from './locale';
import { MESSAGES } from './messages';

export { getLocale, getLocalePreference, initLocale, LOCALE_OPTIONS, setLocalePreference, subscribeLocale } from './locale';
export type { Locale, LocalePreference } from './locale';

export type TranslationParams = Record<string, string | number>;

const fill = (text: string, params?: TranslationParams) =>
  params ? text.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match)) : text;

/** Texto no idioma atual (o português é a chave e a reserva). */
export function t(key: string, params?: TranslationParams): string {
  const locale = getLocale();
  return fill(locale === 'pt-BR' ? key : (MESSAGES[locale][key] ?? key), params);
}

/** Marca uma chave numa constante, para ser traduzida depois com t(). */
export const msg = (key: string): string => key;
