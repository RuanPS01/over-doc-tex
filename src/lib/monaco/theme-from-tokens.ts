import { hslChannelsToRgb, readColorToken } from '@/lib/color';
import type { MonacoApi } from './types';

/**
 * O Monaco só aceita cores hexadecimais. Para não fixar cores no código, o
 * tema é gerado em runtime a partir dos tokens CSS (--editor-*), convertendo
 * os canais HSL para o formato que o Monaco exige.
 */

/** Converte canais "H S% L%" em "#rrggbb". */
export function hslChannelsToHex(channels: string): string {
  const { r, g, b } = hslChannelsToRgb(channels);
  const hex = (value: number) =>
    Math.round(value * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

export function applyEditorTheme(monaco: MonacoApi, isDark: boolean): string {
  const themeName = isDark ? 'overdoctex-dark' : 'overdoctex-light';
  const color = (token: string) => hslChannelsToHex(readColorToken(token));
  // Regras de token usam o hexadecimal sem o prefixo "#".
  const ruleColor = (token: string) => color(token).slice(1);

  monaco.editor.defineTheme(themeName, {
    base: isDark ? 'vs-dark' : 'vs',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: ruleColor('editor-command') },
      { token: 'keyword.environment', foreground: ruleColor('editor-command'), fontStyle: 'bold' },
      { token: 'comment', foreground: ruleColor('editor-comment'), fontStyle: 'italic' },
      { token: 'string.math', foreground: ruleColor('editor-math') },
    ],
    colors: {
      'editor.background': color('editor-background'),
      'editor.foreground': color('editor-foreground'),
      'editor.lineHighlightBackground': color('editor-line-highlight'),
      'editor.selectionBackground': color('editor-selection'),
      'editorLineNumber.foreground': color('editor-gutter'),
    },
  });
  return themeName;
}
