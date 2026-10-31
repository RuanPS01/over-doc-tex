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

/** Revisão do repositório publicado; nula se o índice não carregou. */
export async function texliveRevision(): Promise<string | null> {
  return (await loadIndex()).revision;
}

/** Arquivos soltos dos pacotes pedidos, por nome (sem pasta). Falhas viram ausência: o TeX diz o que faltou. */
export async function fetchLooseFiles(packages: readonly string[]): Promise<Record<string, Uint8Array>> {
  if (packages.length === 0) return {};
  const { looseFiles } = await loadIndex();
  const wanted = packages.flatMap((pkg) => (looseFiles[pkg] ?? []).map((name) => ({ pkg, name })));
  const loaded = await Promise.all(wanted.map(async ({ pkg, name }) => ({ name, data: await loadFile(pkg, name) })));
  const files: Record<string, Uint8Array> = {};
  for (const { name, data } of loaded) if (data) files[name] = data;
  return files;
}
