/**
 * Monta o repositório estático de pacotes LaTeX servido pelo próprio site em
 * public/texlive/api/texlive/<pacote>. O compilador (Siglum) já traz o núcleo
 * do TeX Live 2025; os pacotes que faltam ele busca nesse caminho, no mesmo
 * formato do arquivo oficial do TeX Live (.tar.xz). Assim não há servidor.
 *
 * Parte de uma lista curada e inclui as dependências (\RequirePackage,
 * \LoadClass) que não existem nos conjuntos do Siglum. Os arquivos vêm do
 * TeX Live 2025 congelado (mesma versão do motor; exceções em PINNED_YEARS)
 * e mantêm a licença de cada pacote (em geral LPPL), sem modificação.
 * Arquivos que o Siglum descarta ao instalar um pacote (.ldf) também saem
 * soltos em public/texlive/files, listados em packages.json.
 *
 * Uso: node scripts/latex-packages.mjs   (atrás de proxy: NODE_USE_ENV_PROXY=1)
 * Arquivos já baixados são reaproveitados.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

const MIRRORS = [
  'https://ftp.math.utah.edu/pub/tex/historic/systems/texlive/{year}/tlnet-final/archive',
  'https://ftp.tu-chemnitz.de/pub/tug/historic/systems/texlive/{year}/tlnet-final/archive',
];
const TEXLIVE_YEAR = 2025;

/**
 * Pacotes que vêm de um TeX Live anterior para casar com o que o Siglum já
 * traz. O hyperref dos conjuntos do Siglum é o 7.00v (2023); o lastpage do
 * TeX Live 2024 em diante exige hyperref de 2024-10-30 e para a compilação
 * ("hyperref package version too old"). O 2.0e (TeX Live 2023) não tem essa
 * exigência.
 */
const PINNED_YEARS = { lastpage: 2023 };
const SIGLUM_BUNDLES = 'https://cdn.siglum.org/tl2025/bundles';
const OUTPUT = join(process.cwd(), 'public', 'texlive');
const ARCHIVE_DIR = join(OUTPUT, 'api', 'texlive');
const LOOSE_DIR = join(OUTPUT, 'files');
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
  // Avisos filtrados no preâmbulo (\WarningFilter, comum em modelos abnTeX2)
  'silence',
  // Idiomas e normas brasileiras (o abnTeX2 costuma pedir inglês, francês e espanhol para hifenização)
  'babel-portuges', 'babel-french', 'babel-spanish', 'abntex2', 'memoir',
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
  const year = PINNED_YEARS[pkg] ?? TEXLIVE_YEAR;
  for (const mirror of MIRRORS) {
    try {
      const response = await fetch(`${mirror.replace('{year}', String(year))}/${pkg}.tar.xz`);
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

/**
 * Arquivos de execução que o Siglum descarta ao instalar um pacote: ele só
 * guarda .sty, .cls, .def, .cfg, .tex, .fd, .clo, .ltx e fontes. O .ldf dos
 * idiomas do babel fica fora; o site publica esses arquivos soltos em
 * public/texlive/files/<pacote>/ e o app os envia junto com o documento.
 */
const LOOSE_EXTENSIONS = ['.ldf'];

/** Arquivos (.sty e .cls) que os arquivos do pacote pedem e arquivos que precisam ir soltos. */
function inspectArchive(archivePath, pkg) {
  const dir = mkdtempSync(join(tmpdir(), 'texpkg-'));
  try {
    execFileSync('tar', ['-xJf', archivePath, '-C', dir]);
    const wanted = new Set();
    const runtime = walk(dir).filter((path) => !/[\\/](doc|source|tlpkg)[\\/]/.test(path.slice(dir.length)));
    for (const file of runtime.filter((path) => /\.(sty|cls|def|tex)$/.test(path))) {
      const text = readFileSync(file, 'latin1');
      for (const match of text.matchAll(REQUIRE)) {
        for (const name of match[1].split(',')) if (/^[\w-]+$/.test(name.trim())) wanted.add(`${name.trim()}.sty`);
      }
      for (const match of text.matchAll(LOAD_CLASS)) {
        if (/^[\w-]+$/.test(match[1].trim())) wanted.add(`${match[1].trim()}.cls`);
      }
    }
    const loose = runtime.filter((path) => LOOSE_EXTENSIONS.some((extension) => path.endsWith(extension)));
    if (loose.length > 0) {
      const target = join(LOOSE_DIR, pkg);
      mkdirSync(target, { recursive: true });
      for (const file of loose) copyFileSync(file, join(target, basename(file)));
    }
    return { required: [...wanted], loose: loose.map((file) => basename(file)).sort() };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  mkdirSync(ARCHIVE_DIR, { recursive: true });
  rmSync(LOOSE_DIR, { recursive: true, force: true });
  log('Lendo os índices do Siglum (TeX Live 2025)...');
  const manifest = await fetchJson(`${SIGLUM_BUNDLES}/file-manifest.json`);
  const fileToPackage = await fetchJson(`${SIGLUM_BUNDLES}/file-to-package.json`);
  const available = new Set(Object.keys(manifest).map((path) => path.slice(path.lastIndexOf('/') + 1)));

  const roots = new Set(ROOT_PACKAGES);
  const queue = [...ROOT_PACKAGES];
  const done = new Map();
  const looseFiles = {};
  const skipped = [];

  while (queue.length > 0) {
    const pkg = queue.shift();
    if (done.has(pkg)) continue;
    const target = join(ARCHIVE_DIR, pkg);
    // Os fixados em outro ano sempre são baixados de novo (uma cópia antiga pode ser do ano errado).
    if (!existsSync(target) || pkg in PINNED_YEARS) {
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

    const { required, loose } = inspectArchive(target, pkg);
    if (loose.length > 0) looseFiles[pkg] = loose;
    for (const file of required) {
      if (available.has(file)) continue;
      const dependency = fileToPackage[file];
      if (typeof dependency === 'string' && !done.has(dependency) && !queue.includes(dependency)) queue.push(dependency);
    }
  }

  const packages = [...done].filter(([, size]) => size > 0).sort(([a], [b]) => a.localeCompare(b));
  const totalBytes = packages.reduce((sum, [, size]) => sum + size, 0);
  const content = { texlive: TEXLIVE_YEAR, packages: Object.fromEntries(packages), pinned: PINNED_YEARS, looseFiles };
  // Muda quando o conteúdo muda: o app limpa o cache de pacotes do Siglum no navegador (que
  // guarda até os "não encontrado") para buscar de novo o que foi acrescentado ou trocado.
  const revision = createHash('sha256').update(JSON.stringify(content)).digest('hex').slice(0, 16);
  writeFileSync(join(OUTPUT, 'packages.json'), `${JSON.stringify({ revision, ...content }, null, 2)}\n`);
  log(`${packages.length} pacotes, ${(totalBytes / 1024 / 1024).toFixed(1)} MB em ${ARCHIVE_DIR}`);
  for (const line of skipped) log(`ignorado: ${line}`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exit(1);
});
