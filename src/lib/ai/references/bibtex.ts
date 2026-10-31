/**
 * Extração mínima de referências: entradas BibTeX (.bib) e links soltos
 * (\url, \href) nos arquivos .tex. Não pretende ser um parser BibTeX completo.
 */
import type { TextSource } from '../rag';

export interface ReferenceEntry {
  key: string;
  title: string | null;
  authors: string | null;
  year: string | null;
  url: string | null;
}

/** Lê o valor de um campo delimitado por chaves, respeitando chaves aninhadas. */
function readBraced(text: string, start: number): { value: string; end: number } {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (char === '{') depth++;
    else if (char === '}') {
      depth--;
      if (depth === 0) return { value: text.slice(start + 1, i), end: i + 1 };
    }
  }
  return { value: text.slice(start + 1), end: text.length };
}

function parseFields(body: string): Map<string, string> {
  const fields = new Map<string, string>();
  const fieldRe = /([a-zA-Z]+)\s*=\s*/g;
  let match: RegExpExecArray | null;
  while ((match = fieldRe.exec(body)) !== null) {
    const name = (match[1] ?? '').toLowerCase();
    const valueStart = fieldRe.lastIndex;
    const opener = body[valueStart];
    let value: string;
    if (opener === '{') {
      const read = readBraced(body, valueStart);
      value = read.value;
      fieldRe.lastIndex = read.end;
    } else if (opener === '"') {
      const close = body.indexOf('"', valueStart + 1);
      value = body.slice(valueStart + 1, close === -1 ? undefined : close);
      fieldRe.lastIndex = close === -1 ? body.length : close + 1;
    } else {
      value = /^[^,\n}]*/.exec(body.slice(valueStart))?.[0] ?? '';
    }
    fields.set(name, value.replace(/[{}]/g, '').replace(/\s+/g, ' ').trim());
  }
  return fields;
}

export function parseBibtex(content: string): ReferenceEntry[] {
  const entries: ReferenceEntry[] = [];
  const entryRe = /@([a-zA-Z]+)\s*\{\s*([^,\s]+)\s*,/g;
  let match: RegExpExecArray | null;
  while ((match = entryRe.exec(content)) !== null) {
    const type = (match[1] ?? '').toLowerCase();
    if (type === 'comment' || type === 'string' || type === 'preamble') continue;
    const braceIndex = content.indexOf('{', match.index);
    const { value: body, end } = readBraced(content, braceIndex);
    entryRe.lastIndex = end;

    const fields = parseFields(body.slice(body.indexOf(',') + 1));
    const doi = fields.get('doi');
    entries.push({
      key: match[2] ?? '',
      title: fields.get('title') ?? null,
      authors: fields.get('author') ?? null,
      year: fields.get('year') ?? null,
      url: fields.get('url') ?? (doi ? `https://doi.org/${doi.replace(/^https?:\/\/doi\.org\//, '')}` : null),
    });
  }
  return entries;
}

/** Junta entradas BibTeX e links \url/\href citados diretamente no texto. */
export function collectReferences(files: readonly TextSource[], limit: number): ReferenceEntry[] {
  const fromBib = files.filter((file) => file.kind === 'bib').flatMap((file) => parseBibtex(file.content));
  const knownUrls = new Set(fromBib.flatMap((entry) => (entry.url ? [entry.url] : [])));

  const inline = files
    .filter((file) => file.kind === 'tex')
    .flatMap((file) =>
      file.content.split(/\r?\n/).flatMap((line, index) =>
        [...line.matchAll(/\\(?:url|href)\{([^}]+)\}/g)].flatMap((found) => {
          const url = found[1]?.trim();
          if (!url || knownUrls.has(url)) return [];
          knownUrls.add(url);
          return [{ key: `${file.path}:${index + 1}`, title: null, authors: null, year: null, url }];
        }),
      ),
    );

  return [...fromBib, ...inline].slice(0, limit);
}
