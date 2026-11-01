import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { t } from '@/lib/i18n';
import { detectLocale } from '@/lib/i18n/locale';
import { MESSAGES } from '@/lib/i18n/messages';

const SRC = join(process.cwd(), 'src');
const MESSAGES_DIR = join(SRC, 'lib', 'i18n', 'messages');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (path === MESSAGES_DIR) return [];
    return statSync(path).isDirectory() ? walk(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

const unescape = (text: string) => text.replace(/\\(['"\\])/g, '$1').replace(/\\n/g, '\n');

/** Chaves usadas no código: t('...') e msg('...') com string literal. */
function usedKeys(): Map<string, string> {
  const keys = new Map<string, string>();
  const pattern = /(?<![\w$])(?:t|msg)\(\s*(['"])((?:\\.|(?!\1)[^\\])*)\1/g;
  for (const file of walk(SRC)) {
    // Exemplos em comentários não contam.
    const code = readFileSync(file, 'utf8').replace(/^\s*(\*|\/\/).*$/gm, '');
    for (const match of code.matchAll(pattern)) keys.set(unescape(match[2]!), file.slice(SRC.length + 1));
  }
  return keys;
}

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

describe('internacionalização', () => {
  it('idioma do sistema: pt, es e en; qualquer outro vira inglês', () => {
    expect(detectLocale('pt-BR')).toBe('pt-BR');
    expect(detectLocale('pt-PT')).toBe('pt-BR');
    expect(detectLocale('es-AR')).toBe('es');
    expect(detectLocale('en-GB')).toBe('en');
    expect(detectLocale('fr-FR')).toBe('en');
    expect(detectLocale(undefined)).toBe('en');
  });

  it('fora do navegador o texto sai em português, com as partes variáveis preenchidas', () => {
    expect(t('Revisão #{number} aberta', { number: 3 })).toBe('Revisão #3 aberta');
  });

  it('toda chave usada no código tem tradução em inglês e espanhol, com as mesmas variáveis', () => {
    const missing: string[] = [];
    const mismatched: string[] = [];
    for (const [key, file] of usedKeys()) {
      for (const locale of ['en', 'es'] as const) {
        const translated = MESSAGES[locale][key];
        if (translated === undefined) missing.push(`${locale} ${file}: ${key}`);
        else if (placeholders(translated).join() !== placeholders(key).join()) mismatched.push(`${locale} ${file}: ${key}`);
      }
    }
    expect(missing).toEqual([]);
    expect(mismatched).toEqual([]);
  });
});
