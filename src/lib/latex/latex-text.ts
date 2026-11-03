/**
 * Texto LaTeX convertido para Unicode, como o Biber faz ao ler um .bib:
 * acentos ({\"o}, \'e, \c{c}), letras especiais (\ss, \o, \aa) e grupos de
 * uma letra só. Usado para ordenar, para os rótulos (labelalpha, iniciais) e
 * para os hashes de nomes; o texto que vai para o .bbl continua como veio.
 */

/** Acentos de símbolo: valem colados à letra (\"o, \'{e}). */
const SYMBOL_ACCENTS: Record<string, string> = {
  '`': '̀',
  "'": '́',
  '^': '̂',
  '~': '̃',
  '=': '̄',
  '.': '̇',
  '"': '̈',
};

/** Acentos de letra: precisam de espaço ou chaves antes da letra (\c c, \v{s}). */
const LETTER_ACCENTS: Record<string, string> = {
  u: '̆',
  r: '̊',
  H: '̋',
  v: '̌',
  d: '̣',
  c: '̧',
  k: '̨',
  b: '̱',
  t: '͡',
};

const SPECIAL_LETTERS: Record<string, string> = {
  i: 'ı', j: 'ȷ', o: 'ø', O: 'Ø', l: 'ł', L: 'Ł', aa: 'å', AA: 'Å', ae: 'æ', AE: 'Æ', oe: 'œ', OE: 'Œ',
  ss: 'ß', SS: 'SS', dh: 'ð', DH: 'Ð', th: 'þ', TH: 'Þ', ng: 'ŋ', NG: 'Ŋ',
  textendash: '\u2013', textemdash: '\u2014', textquoteright: '’', textquoteleft: '‘',
};

// A base do acento: letra, \i ou \j, com ou sem chaves.
const BASE = String.raw`(\{\s*(?:\\[ij](?![a-zA-Z])|[a-zA-Z])\s*\}|\\[ij](?![a-zA-Z])|[a-zA-Z])`;
const SYMBOL_ACCENT_RE = new RegExp(String.raw`\\([\x60'^~=."])\s*` + BASE, 'g');
const LETTER_ACCENT_RE = new RegExp(String.raw`\\([urHvdckbt])(?:\s+|(?=\{))` + BASE, 'g');
const SPECIAL_RE = /\\(ss|SS|aa|AA|ae|AE|oe|OE|dh|DH|th|TH|ng|NG|textendash|textemdash|textquoteright|textquoteleft|[ijoOlL])(?![a-zA-Z])(?:\{\}|\s*)/g;

function accented(base: string, mark: string): string {
  const letter = base.replace(/[{}\s]/g, '');
  // Como no Biber: \'\i, \`\i e \^\i viram í, ì e î; com os outros acentos o i fica sem pingo (\"\i dá ı com trema).
  const dotted = mark === '\u0301' || mark === '\u0300' || mark === '\u0302';
  const plain = letter === '\\i' ? (dotted ? 'i' : 'ı') : letter === '\\j' ? (dotted ? 'j' : 'ȷ') : letter;
  return `${plain}${mark}`.normalize('NFC');
}

/** Acentos e letras especiais em Unicode; o resto (chaves, outros comandos) fica. */
export function decodeLatex(text: string): string {
  if (!text.includes('\\')) return text.normalize('NFC');
  return (
    text
      .replace(SYMBOL_ACCENT_RE, (_, accent: string, base: string) => accented(base, SYMBOL_ACCENTS[accent]!))
      .replace(LETTER_ACCENT_RE, (_, accent: string, base: string) => accented(base, LETTER_ACCENTS[accent]!))
      .replace(SPECIAL_RE, (_, name: string) => SPECIAL_LETTERS[name]!)
      // {ö} sobra de {\"o}: as chaves em volta de uma letra só saem (as de um comando, \emph{A}, ficam).
      .replace(/(?<!\\[a-zA-Z]+\s*)\{(\p{L}\p{M}*)\}/gu, '$1')
      .normalize('NFC')
  );
}

/** Só o texto: acentos decodificados, sem comandos (\emph{x} vira x), chaves nem til. */
export function plainText(text: string): string {
  return decodeLatex(text)
    .replace(/\\[a-zA-Z]+\*?\s*/g, '')
    .replace(/\\(.)/g, '$1')
    .replace(/[{}]/g, '')
    .replace(/~/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
