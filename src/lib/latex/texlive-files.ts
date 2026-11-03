/**
 * Índice e arquivos soltos do repositório de pacotes do site (public/texlive,
 * gerado por scripts/latex-packages.mjs).
 *
 * - Arquivos soltos: o Siglum instala os pacotes do TeX Live guardando só
 *   algumas extensões (.sty, .cls, .def, .tex, fontes...) e descarta, por
 *   exemplo, o .ldf dos idiomas do babel. O script publica esses arquivos à
 *   parte (`looseFiles` no packages.json); aqui eles são baixados e vão para a
 *   pasta do documento, onde o TeX também procura.
 * - Revisão: muda quando o repositório muda; o compilador usa para limpar o
 *   cache de pacotes do Siglum no navegador.
 */

interface TexliveIndex {
  revision: string | null;
  looseFiles: Record<string, readonly string[]>;
}

const EMPTY: TexliveIndex = { revision: null, looseFiles: {} };

const base = () => new URL(`${import.meta.env.BASE_URL}texlive/`, window.location.origin).href;

let indexPromise: Promise<TexliveIndex> | null = null;
const fileCache = new Map<string, Promise<Uint8Array | null>>();

function loadIndex(): Promise<TexliveIndex> {
  indexPromise ??= fetch(`${base()}packages.json`, { cache: 'no-cache' })
    .then(async (response) => {
      if (!response.ok) throw new Error(`packages.json: ${response.status}`);
      const manifest = (await response.json()) as { revision?: unknown; looseFiles?: unknown };
      return {
        revision: typeof manifest.revision === 'string' ? manifest.revision : null,
        looseFiles: manifest.looseFiles && typeof manifest.looseFiles === 'object' ? (manifest.looseFiles as TexliveIndex['looseFiles']) : {},
      };
    })
    .catch(() => {
      // Sem rede ou sem o índice: tenta de novo na próxima compilação.
      indexPromise = null;
      return EMPTY;
    });
  return indexPromise;
}

function loadFile(pkg: string, name: string): Promise<Uint8Array | null> {
  const key = `${pkg}/${name}`;
  let file = fileCache.get(key);
  if (!file) {
    file = fetch(`${base()}files/${key}`)
      .then(async (response) => (response.ok ? new Uint8Array(await response.arrayBuffer()) : null))
      .catch(() => null);
    // Falha não fica guardada: a próxima compilação tenta de novo.
    void file.then((data) => {
      if (!data) fileCache.delete(key);
    });
    fileCache.set(key, file);
  }
  return file;
}

let fontIndexPromise: Promise<[string, string][]> | null = null;

/** Prefixos de nomes de fontes e o pacote de cada um (fonts.json), do mais longo para o mais curto. */
function loadFontIndex(): Promise<[string, string][]> {
  fontIndexPromise ??= fetch(`${base()}fonts.json`)
    .then(async (response) => {
      if (!response.ok) throw new Error(`fonts.json: ${response.status}`);
      const index = (await response.json()) as Record<string, readonly string[]>;
      return Object.entries(index)
        .flatMap(([pkg, prefixes]) => prefixes.map((prefix): [string, string] => [prefix, pkg]))
        .sort(([a], [b]) => b.length - a.length);
    })
    .catch(() => {
      fontIndexPromise = null;
      return [];
    });
  return fontIndexPromise;
}

/** Pacotes do repositório que têm as fontes pedidas (ptmr7t está no pacote times). */
export async function fontPackagesFor(fonts: readonly string[]): Promise<string[]> {
  if (fonts.length === 0) return [];
  const index = await loadFontIndex();
  const found = new Set<string>();
  for (const font of fonts) {
    const match = index.find(([prefix]) => font.startsWith(prefix));
    if (match) found.add(match[1]);
  }
  return [...found];
}

let guardInstalled = false;

/**
 * Hospedagens de SPA (Firebase Hosting, vite preview) respondem a um caminho
 * que não existe com o index.html e status 200. Para o Siglum, um pacote que
 * não está no repositório pareceria existir (e falharia ao descompactar), e
 * ele não chegaria a procurar no índice de arquivos (algorithm.sty está no
 * pacote algorithms). Respostas HTML no caminho do repositório viram 404.
 */
export function installTexliveFetchGuard(): void {
  if (guardInstalled || typeof window === 'undefined') return;
  guardInstalled = true;
  const original = window.fetch.bind(window);
  const prefix = base();
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await original(input, init);
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith(prefix) && response.ok && (response.headers.get('content-type') ?? '').includes('text/html')) {
      return new Response(null, { status: 404, statusText: 'Not Found' });
    }
    return response;
  };
}

/** Revisão do repositório publicado; nula se o índice não carregou. */
export async function texliveRevision(): Promise<string | null> {
  return (await loadIndex()).revision;
}

/**
 * Arquivos soltos dos pacotes pedidos, por nome (sem pasta). `byName` pede
 * arquivos pelo nome (o estilo abnt.bbx, por exemplo): vêm todos os arquivos
 * soltos do pacote que tem cada um (biblatex-abnt), com as traduções (.lbx)
 * e os estilos que ele pede. Falhas viram ausência: o TeX diz o que faltou.
 */
export async function fetchLooseFiles(packages: readonly string[], byName: readonly string[] = []): Promise<Record<string, Uint8Array>> {
  if (packages.length === 0 && byName.length === 0) return {};
  const { looseFiles } = await loadIndex();
  const owners = byName.length > 0 ? Object.keys(looseFiles).filter((pkg) => byName.some((name) => looseFiles[pkg]!.includes(name))) : [];
  const wanted = [...new Set([...packages, ...owners])].flatMap((pkg) => (looseFiles[pkg] ?? []).map((name) => ({ pkg, name })));
  const loaded = await Promise.all(wanted.map(async ({ pkg, name }) => ({ name, data: await loadFile(pkg, name) })));
  const files: Record<string, Uint8Array> = {};
  for (const { name, data } of loaded) if (data) files[name] = data;
  return files;
}
