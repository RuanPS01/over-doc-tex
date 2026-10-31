/**
 * Nomes de pessoas no BibTeX (puro): "Nome Sobrenome", "Sobrenome, Nome",
 * partícula ("da", "von") e chaves que protegem nomes compostos ou de
 * instituição ("{Equipe abnTeX2}"). Usado pelos estilos de bibliografia.
 */

export interface Person {
  first: string;
  von: string;
  last: string;
  jr: string;
}

/** Divide no separador só fora de chaves. */
export function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of text) {
    if (char === '{') depth++;
    if (char === '}') depth--;
    if (char === separator && depth === 0) {
      parts.push(current);
      current = '';
    } else current += char;
  }
  parts.push(current);
  return parts;
}

/** "Sobrenome, Nome" ou "Nome Sobrenome" (chaves protegem nomes compostos). */
export function parsePerson(raw: string): Person {
  const name = raw.trim();
  const parts = splitTopLevel(name, ',');
  if (parts.length >= 2) {
    const lastWords = parts[0]!.trim().split(/\s+/);
    const vonIndex = lastWords.findIndex((word) => /^[a-z]/.test(word));
    return {
      von: vonIndex >= 0 && vonIndex < lastWords.length - 1 ? lastWords.slice(vonIndex, -1).join(' ') : '',
      last: vonIndex >= 0 && vonIndex < lastWords.length - 1 ? lastWords.at(-1)! : lastWords.join(' '),
      jr: parts.length === 3 ? parts[1]!.trim() : '',
      first: (parts.length === 3 ? parts[2]! : parts[1]!).trim(),
    };
  }
  const words = splitTopLevel(name, ' ').filter(Boolean);
  if (words.length <= 1) return { first: '', von: '', last: name, jr: '' };
  const vonStart = words.findIndex((word, index) => index > 0 && index < words.length - 1 && /^[a-z]/.test(word));
  const lastStart = vonStart >= 0 ? vonStart : words.length - 1;
  const von = vonStart >= 0 ? words.slice(vonStart, words.length - 1).join(' ') : '';
  return { first: words.slice(0, lastStart).join(' '), von, last: words.at(-1)!, jr: '' };
}

/** Lista de pessoas de um campo author/editor ("A and B and others"); " and " dentro de chaves não separa. */
export function people(field: string | undefined): Person[] {
  if (!field) return [];
  const names: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < field.length; i++) {
    const char = field[i];
    if (char === '{') depth++;
    else if (char === '}') depth--;
    else if (depth === 0 && /\s/.test(char!) && /^\s+and\s/i.test(field.slice(i))) {
      names.push(field.slice(start, i));
      const skip = /^\s+and\s+/i.exec(field.slice(i))![0].length;
      start = i + skip;
      i = start - 1;
    }
  }
  names.push(field.slice(start));
  return names
    .map((name) => name.trim())
    .filter(Boolean)
    .map(parsePerson);
}

export const isOthers = (person: Person) => person.last === 'others' && !person.first;

/** Inicial de uma palavra: "Ana" vira "A.", "{\'E}rica" vira "{\'E}.", "Wen-tau" vira "W.-t.". */
function initialOf(word: string): string {
  if (word.startsWith('{\\')) {
    const close = word.indexOf('}');
    return `${close > 0 ? word.slice(0, close + 1) : word}.`;
  }
  // Grupo entre chaves sem comando (nome protegido) fica inteiro.
  if (word.startsWith('{')) return word;
  return word
    .split('-')
    .filter(Boolean)
    .map((part) => {
      // Acento sem chaves (\'Erica, \c{C}esar): o comando vai junto com a letra.
      const accent = /^\\[^a-zA-Z{]\s*(?:\{[^}]*\}|[a-zA-Z])|^\\[a-zA-Z]+\s*\{[^}]*\}/.exec(part);
      if (accent) return `{${accent[0]}}.`;
      return `${part.replace(/^[^\p{L}]*/u, '').charAt(0)}.`;
    })
    .join('-');
}

/** Iniciais do prenome ligadas por til, como o BibTeX faz com {f.}: "A.~M.". */
export const initials = (first: string) =>
  splitTopLevel(first.replace(/~/g, ' '), ' ')
    .filter(Boolean)
    .map(initialOf)
    .join('~');
