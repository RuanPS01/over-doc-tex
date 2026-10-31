import type { MonacoApi } from './types';

export const LATEX_LANGUAGE_ID = 'latex';

/** Registra realce de sintaxe LaTeX (o Monaco não traz LaTeX nativamente). */
export function registerLatexLanguage(monaco: MonacoApi): void {
  if (monaco.languages.getLanguages().some((language) => language.id === LATEX_LANGUAGE_ID)) return;

  monaco.languages.register({ id: LATEX_LANGUAGE_ID, extensions: ['.tex', '.sty', '.cls'] });
  monaco.languages.setMonarchTokensProvider(LATEX_LANGUAGE_ID, {
    tokenizer: {
      root: [
        [/%.*$/, 'comment'],
        [/\\(begin|end)(?=\s*\{)/, 'keyword.environment'],
        [/\\[a-zA-Z@]+\*?/, 'keyword'],
        [/\\./, 'keyword'],
        [/\$\$/, { token: 'string.math', next: '@displayMath' }],
        [/\$/, { token: 'string.math', next: '@inlineMath' }],
        [/[{}]/, 'delimiter.bracket'],
        [/[[\]]/, 'delimiter.square'],
      ],
      inlineMath: [
        [/[^$\\]+/, 'string.math'],
        [/\\./, 'string.math'],
        [/\$/, { token: 'string.math', next: '@pop' }],
      ],
      displayMath: [
        [/[^$\\]+/, 'string.math'],
        [/\\./, 'string.math'],
        [/\$\$/, { token: 'string.math', next: '@pop' }],
        [/\$/, 'string.math'],
      ],
    },
  });
  monaco.languages.setLanguageConfiguration(LATEX_LANGUAGE_ID, {
    comments: { lineComment: '%' },
    brackets: [
      ['{', '}'],
      ['[', ']'],
      ['(', ')'],
    ],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '$', close: '$' },
    ],
    surroundingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '$', close: '$' },
    ],
  });
}
