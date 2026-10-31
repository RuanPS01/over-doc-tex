/**
 * Monta o repositório estático de pacotes LaTeX servido pelo próprio site em
 * public/texlive/api/texlive/<pacote>. O compilador (Siglum) já traz o núcleo
 * do TeX Live 2025; os pacotes que faltam ele busca nesse caminho, no mesmo
 * formato do arquivo oficial do TeX Live (.tar.xz). Assim não há servidor.
 *
 * Parte de uma lista curada e inclui as dependências (\RequirePackage,
 * \LoadClass) que não existem nos conjuntos do Siglum. Os arquivos vêm do
 * TeX Live 2025 congelado (mesma versão do motor) e mantêm a licença de cada
 * pacote (em geral LPPL), sem modificação.
 *
 * Uso: node scripts/latex-packages.mjs   (atrás de proxy: NODE_USE_ENV_PROXY=1)
 * Arquivos já baixados são reaproveitados.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const MIRRORS = [
  'https://ftp.math.utah.edu/pub/tex/historic/systems/texlive/2025/tlnet-final/archive',
  'https://ftp.tu-chemnitz.de/pub/tug/historic/systems/texlive/2025/tlnet-final/archive',
];
const SIGLUM_BUNDLES = 'https://cdn.siglum.org/tl2025/bundles';
const OUTPUT = join(process.cwd(), 'public', 'texlive');
const ARCHIVE_DIR = join(OUTPUT, 'api', 'texlive');
/** Dependência maior que isso só entra se estiver na lista curada. */
const MAX_DEPENDENCY_BYTES = 2 * 1024 * 1024;

/** Pacotes comuns em trabalhos acadêmicos que não vêm no Siglum (conferido compilando um a um). */
export const ROOT_PACKAGES = [
  // Formatação e espaçamento
  'setspace', 'parskip', 'titlesec', 'titling', 'tocloft', 'appendix', 'emptypage', 'footmisc', 'needspace', 'ragged2e',
  // Tabelas e figuras
  'booktabs', 'multirow', 'float', 'placeins', 'wrapfig', 'makecell', 'threeparttable', 'colortbl', 'rotating', 'pdflscape', 'subfig',
  // Listas, código e caixas
  'enumitem', 'listings', 'fancyvrb', 'framed', 'mdframed', 'comment',
  // Marcações do diff visual (\DIFadd e \DIFdel usam o ulem)
  'ulem',
  // Referências, citações e índices
  'biblatex', 'csquotes', 'cleveref', 'glossaries', 'acronym', 'chngcntr', 'lastpage',
  // Matemática e unidades
  'siunitx', 'cancel', 'physics', 'esint', 'units', 'gensymb',
  // Algoritmos
  'algorithm2e', 'algorithmicx', 'algorithms',
  // PDF e utilidades
  'pdfpages', 'eso-pic', 'ifoddpage', 'lipsum', 'blindtext', 'todonotes', 'upquote',
  // Idiomas e normas brasileiras
  'babel-portuges', 'abntex2', 'memoir',
];

function log(message) {
  process.stdout.write(`${message}\n`);
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.json();
}

async function download(pkg) {
  for (const mirror of MIRRORS) {
    try {
      const response = await fetch(`${mirror}/${pkg}.tar.xz`);
      if (response.ok) return new Uint8Array(await response.arrayBuffer());
      if (response.status === 404) return null;
    } catch {
      // Tenta o próximo espelho.
    }
  }
  throw new Error(`Não foi possível baixar ${pkg} de nenhum espelho.`);
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const REQUIRE = /\\(?:RequirePackage|RequirePackageWithOptions|usepackage)\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}/g;
const LOAD_CLASS = /\\LoadClass(?:WithOptions)?\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}/g;

/** Arquivos (.sty e .cls) que os arquivos do pacote pedem. */
function requiredFiles(archivePath) {
  const dir = mkdtempSync(join(tmpdir(), 'texpkg-'));
  try {
    execFileSync('tar', ['-xJf', archivePath, '-C', dir]);
    const wanted = new Set();
    for (const file of walk(dir).filter((path) => /\.(sty|cls|def|tex)$/.test(path))) {
      const text = readFileSync(file, 'latin1');
      for (const match of text.matchAll(REQUIRE)) {
        for (const name of match[1].split(',')) if (/^[\w-]+$/.test(name.trim())) wanted.add(`${name.trim()}.sty`);
      }
      for (const match of text.matchAll(LOAD_CLASS)) {
        if (/^[\w-]+$/.test(match[1].trim())) wanted.add(`${match[1].trim()}.cls`);
      }
    }
    return [...wanted];
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  mkdirSync(ARCHIVE_DIR, { recursive: true });
  log('Lendo os índices do Siglum (TeX Live 2025)...');
  const manifest = await fetchJson(`${SIGLUM_BUNDLES}/file-manifest.json`);
  const fileToPackage = await fetchJson(`${SIGLUM_BUNDLES}/file-to-package.json`);
  const available = new Set(Object.keys(manifest).map((path) => path.slice(path.lastIndexOf('/') + 1)));

  const roots = new Set(ROOT_PACKAGES);
  const queue = [...ROOT_PACKAGES];
  const done = new Map();
  const skipped = [];

  while (queue.length > 0) {
    const pkg = queue.shift();
    if (done.has(pkg)) continue;
    const target = join(ARCHIVE_DIR, pkg);
    if (!existsSync(target)) {
      const data = await download(pkg);
      if (!data) {
        skipped.push(`${pkg} (não existe no TeX Live 2025)`);
        done.set(pkg, 0);
        continue;
      }
      if (!roots.has(pkg) && data.byteLength > MAX_DEPENDENCY_BYTES) {
        skipped.push(`${pkg} (${Math.round(data.byteLength / 1024)} KB, grande demais para dependência)`);
        done.set(pkg, 0);
        continue;
      }
      writeFileSync(target, data);
    }
    done.set(pkg, statSync(target).size);

    for (const file of requiredFiles(target)) {
      if (available.has(file)) continue;
      const dependency = fileToPackage[file];
      if (typeof dependency === 'string' && !done.has(dependency) && !queue.includes(dependency)) queue.push(dependency);
    }
  }

  const packages = [...done].filter(([, size]) => size > 0).sort(([a], [b]) => a.localeCompare(b));
  const totalBytes = packages.reduce((sum, [, size]) => sum + size, 0);
  writeFileSync(
    join(OUTPUT, 'packages.json'),
    `${JSON.stringify({ texlive: 2025, packages: Object.fromEntries(packages) }, null, 2)}\n`,
  );
  log(`${packages.length} pacotes, ${(totalBytes / 1024 / 1024).toFixed(1)} MB em ${ARCHIVE_DIR}`);
  for (const line of skipped) log(`ignorado: ${line}`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exit(1);
});
