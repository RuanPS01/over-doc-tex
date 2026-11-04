/**
 * Monta o repositório estático de pacotes LaTeX servido pelo próprio site em
 * public/texlive/api/texlive/<pacote>. O compilador (Siglum) já traz o núcleo
 * do TeX Live 2025; os pacotes que faltam ele busca nesse caminho, no mesmo
 * formato do arquivo oficial do TeX Live (.tar.xz). Assim não há servidor.
 *
 * O repositório segue o que um usuário do Overleaf espera ter: as coleções do
 * TeX Live usadas por documentos pdfLaTeX (LaTeX recomendado e extra, figuras,
 * matemática e ciências, bibliografia, editoras e periódicos, fontes, idiomas
 * europeus), lidas do índice oficial (texlive.tlpdb). Entram só os pacotes que
 * o Siglum não traz, até MAX_PACKAGE_BYTES cada (as exceções grandes e muito
 * usadas estão em LARGE_PACKAGES), mais a lista curada ROOT_PACKAGES e as
 * dependências (\RequirePackage, \LoadClass) de tudo isso. Os arquivos vêm do
 * TeX Live 2025 congelado (mesma versão do motor; exceções em PINNED_YEARS) e
 * mantêm a licença de cada pacote (em geral LPPL), sem modificação.
 *
 * Arquivos que o Siglum descarta ao instalar um pacote (.ldf do babel, estilos
 * do biblatex, dicionários do translator) também saem soltos em
 * public/texlive/files, listados em packages.json.
 *
 * Índices gerados junto:
 * - bundles/file-to-package.json: arquivo do TeX (.sty, .cls, .fd...) para o
 *   pacote que o tem, onde o Siglum procura quando o nome do arquivo não é o
 *   do pacote (algorithm.sty está no pacote algorithms);
 * - fonts.json: prefixos de nomes de fontes (.tfm, .vf, .pfb) por pacote. O
 *   Siglum não sabe de onde vem uma fonte que falta (ptmr7t.tfm, do pacote
 *   times); o app lê esse índice, busca o pacote e compila de novo.
 *
 * Uso: node scripts/latex-packages.mjs   (atrás de proxy: NODE_USE_ENV_PROXY=1)
 * Arquivos já baixados são reaproveitados; os que saíram da seleção são apagados.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const MIRRORS = [
  'https://ftp.math.utah.edu/pub/tex/historic/systems/texlive/{year}/tlnet-final',
  'https://ftp.tu-chemnitz.de/pub/tug/historic/systems/texlive/{year}/tlnet-final',
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

/**
 * Coleções do TeX Live que formam o repositório. Ficam de fora as que só
 * servem a outros motores ou formatos (ConTeXt, LuaTeX, XeTeX, PSTricks,
 * MetaPost), os idiomas de escrita não latina e os utilitários de sistema.
 */
const COLLECTIONS = [
  'collection-latex',
  'collection-latexrecommended',
  'collection-latexextra',
  'collection-pictures',
  'collection-mathscience',
  'collection-bibtexextra',
  'collection-publishers',
  'collection-plaingeneric',
  'collection-fontsrecommended',
  'collection-fontsextra',
  'collection-langportuguese',
  'collection-langspanish',
  'collection-langenglish',
  'collection-langeuropean',
  'collection-langfrench',
  'collection-langgerman',
  'collection-langitalian',
];
/** Pacote das coleções maior que isso fica de fora (em geral, famílias de fontes para XeLaTeX e LuaLaTeX). */
const MAX_PACKAGE_BYTES = 1.5 * 1024 * 1024;
/**
 * Grandes, mas muito usados com pdfLaTeX: entram mesmo acima do limite. As
 * famílias de fontes daqui têm versão Type 1 (.pfb), que o pdfTeX usa; as que
 * só têm OpenType (newcomputermodern, por exemplo) não serviriam ao motor.
 */
const LARGE_PACKAGES = new Set([
  'koma-script', 'newtx', 'newpx', 'tex-gyre', 'libertine', 'libertinus-type1', 'fontawesome5', 'fontawesome6', 'stix', 'stix2-type1',
  'sourcesanspro', 'sourceserifpro', 'sourcecodepro', 'opensans', 'kpfonts', 'xcharter', 'mathdesign', 'tipa', 'cochineal', 'erewhon',
  'mlmodern', 'cm-unicode',
  // Símbolos matemáticos
  'mnsymbol', 'mathabx-type1', 'txfontsb', 'sansmathfonts',
  // Famílias de texto populares
  'dejavu', 'lato', 'ebgaramond', 'fira', 'roboto', 'montserrat', 'plex', 'merriweather', 'raleway', 'librefranklin', 'carlito',
  'tinos', 'arimo', 'cabin', 'crimsonpro', 'spectral', 'playfair', 'atkinson', 'nunito', 'oldstandard', 'garamond-libre',
  'cormorantgaramond', 'inriafonts', 'droid', 'chivo', 'noto',
  // Outros
  'utfsym', 'worldflags', 'media9',
]);
/** Dependência maior que isso só entra se estiver numa lista acima. */
const MAX_DEPENDENCY_BYTES = 2 * 1024 * 1024;
/** Downloads simultâneos. */
const CONCURRENCY = 12;

/**
 * Extensões que importam para um documento pdfLaTeX: o que o TeX lê (incluindo
 * as que o Siglum descarta e vão soltas) e as fontes. Um pacote do TeX Live só
 * entra no repositório se algum desses arquivos não estiver nos conjuntos do Siglum.
 */
const RUNTIME_FILE = /\.(sty|cls|def|cfg|tex|fd|clo|ltx|ldf|bbx|cbx|lbx|dbx|dict|pfb|tfm|vf|map|enc)$/;

/** Pacotes comuns em trabalhos acadêmicos que não vêm no Siglum (conferido compilando um a um). */
export const ROOT_PACKAGES = [
  // Formatação e espaçamento
  'setspace', 'parskip', 'titlesec', 'titling', 'tocloft', 'appendix', 'emptypage', 'footmisc', 'needspace', 'ragged2e',
  // Tabelas e figuras
  'booktabs', 'multirow', 'float', 'placeins', 'wrapfig', 'makecell', 'threeparttable', 'colortbl', 'pdflscape', 'subfig',
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
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetch(`${mirror.replace('{year}', String(year))}/archive/${pkg}.tar.xz`);
        if (response.ok) return new Uint8Array(await response.arrayBuffer());
        if (response.status === 404) return null;
      } catch {
        // Falha de rede: tenta de novo e depois o próximo espelho.
      }
    }
  }
  throw new Error(`Não foi possível baixar ${pkg} de nenhum espelho.`);
}

/** Índice oficial do TeX Live do ano do motor: pacote, coleção, dependências, tamanho e arquivos de execução. */
async function loadTlpdb() {
  for (const mirror of MIRRORS) {
    try {
      const response = await fetch(`${mirror.replace('{year}', String(TEXLIVE_YEAR))}/tlpkg/texlive.tlpdb.xz`);
      if (!response.ok) continue;
      const text = execFileSync('xz', ['-dc'], { input: Buffer.from(await response.arrayBuffer()), maxBuffer: 256 * 1024 * 1024 }).toString('utf8');
      return parseTlpdb(text);
    } catch {
      // Tenta o próximo espelho.
    }
  }
  throw new Error('Não foi possível baixar o texlive.tlpdb de nenhum espelho.');
}

/** Lê o formato do tlpdb: blocos separados por linha vazia, um campo por linha, arquivos recuados. */
export function parseTlpdb(text) {
  const db = new Map();
  let current = null;
  let inRunfiles = false;
  for (const line of text.split('\n')) {
    if (line === '') {
      current = null;
      inRunfiles = false;
    } else if (line.startsWith('name ')) {
      current = { name: line.slice(5), category: '', depends: [], size: 0, runfiles: [] };
      db.set(current.name, current);
      inRunfiles = false;
    } else if (!current) {
      continue;
    } else if (line.startsWith(' ')) {
      if (inRunfiles) current.runfiles.push(line.trim().split(' ')[0]);
    } else {
      inRunfiles = line.startsWith('runfiles ');
      if (line.startsWith('category ')) current.category = line.slice(9);
      else if (line.startsWith('depend ')) current.depends.push(line.slice(7));
      else if (line.startsWith('containersize ')) current.size = Number(line.split(' ')[1]);
    }
  }
  return db;
}

/**
 * Pacotes das coleções que o repositório precisa ter: pacotes comuns (sem
 * sufixo de plataforma), com algum arquivo de execução ausente nos conjuntos
 * do Siglum e dentro do limite de tamanho (ou na lista de exceções).
 */
export function selectFromCollections(db, collections, siglumFiles, { maxBytes = MAX_PACKAGE_BYTES, large = LARGE_PACKAGES } = {}) {
  const reached = new Set();
  const visit = (name) => {
    if (reached.has(name) || !db.has(name)) return;
    reached.add(name);
    for (const dependency of db.get(name).depends) if (!dependency.includes('.')) visit(dependency);
  };
  for (const collection of collections) visit(collection);
  const selected = [];
  const tooLarge = [];
  for (const name of reached) {
    const entry = db.get(name);
    if (['Collection', 'Scheme'].includes(entry.category) || name.includes('.')) continue;
    // No tlpdb do espelho os caminhos começam com RELOC/ (instalação relocável); no instalado, com texmf-dist/.
    const runtime = entry.runfiles.filter((path) => /^(RELOC|texmf-dist)\/(tex|fonts)\//.test(path) && RUNTIME_FILE.test(path));
    if (!runtime.some((path) => !siglumFiles.has(path.slice(path.lastIndexOf('/') + 1)))) continue;
    if (entry.size > maxBytes && !large.has(name)) tooLarge.push(name);
    else selected.push(name);
  }
  return { selected: selected.sort(), tooLarge: tooLarge.sort() };
}

/** Tamanho do começo comum de dois textos. */
function commonPrefix(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

/**
 * Prefixos que identificam o pacote de cada fonte: para cada nome, o menor
 * começo (3 letras ou mais) que nenhum nome de outro pacote compartilha. Os
 * nomes de fontes seguem famílias (ptm..., phv...), então poucos prefixos
 * cobrem dezenas de milhares de arquivos. Quem consulta usa o prefixo mais
 * longo que casar.
 */
export function fontPrefixes(fontToPackage) {
  const names = [...fontToPackage.keys()].sort();
  const byPackage = new Map();
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    const pkg = fontToPackage.get(name);
    let left = i - 1;
    while (left >= 0 && fontToPackage.get(names[left]) === pkg) left--;
    let right = i + 1;
    while (right < names.length && fontToPackage.get(names[right]) === pkg) right++;
    const shared = Math.max(left >= 0 ? commonPrefix(name, names[left]) : 0, right < names.length ? commonPrefix(name, names[right]) : 0);
    const prefix = name.slice(0, Math.min(name.length, Math.max(3, shared + 1)));
    const list = byPackage.get(pkg) ?? [];
    if (!list.some((existing) => prefix.startsWith(existing))) {
      byPackage.set(pkg, [...list.filter((existing) => !existing.startsWith(prefix)), prefix]);
    }
  }
  return Object.fromEntries([...byPackage].sort(([a], [b]) => a.localeCompare(b)).map(([pkg, list]) => [pkg, list.sort()]));
}

/** Índices do repositório: arquivo do TeX para pacote (para o Siglum) e prefixos de fontes (para o app). */
function buildIndexes(tlpdb, packages, available) {
  const fileToPackage = {};
  const fontToPackage = new Map();
  for (const pkg of packages) {
    const entry = tlpdb.get(pkg);
    if (!entry) continue;
    for (const path of entry.runfiles) {
      const name = path.slice(path.lastIndexOf('/') + 1);
      if (/\/tex\//.test(path) && /\.(sty|cls|def|clo|fd|cfg|tex)$/.test(name)) fileToPackage[name] ??= pkg;
      const font = /\/fonts\/(?:tfm|vf|type1)\/.*\/([^/]+)\.(?:tfm|vf|pfb)$/.exec(path);
      if (font && !available.has(name) && !fontToPackage.has(font[1])) fontToPackage.set(font[1], pkg);
    }
  }
  return { fileToPackage, fonts: fontPrefixes(fontToPackage) };
}

/** Roda `task` para cada item, até `limit` ao mesmo tempo. */
async function inPool(items, limit, task) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      await task(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
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
 * guarda .sty, .cls, .def, .cfg, .tex, .fd, .clo, .ltx e fontes. Ficam fora o
 * .ldf dos idiomas do babel, os estilos do biblatex (.bbx, .cbx, .lbx, .dbx) e
 * os dicionários do translator (.dict); o site publica esses arquivos soltos
 * em public/texlive/files/<pacote>/ e o app os envia junto com o documento.
 */
const LOOSE_EXTENSIONS = ['.ldf', '.bbx', '.cbx', '.lbx', '.dbx', '.dict'];

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
    return { required: [...wanted], loose: [...new Set(loose.map((file) => basename(file)))].sort() };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Baixa o pacote (se ainda não estiver no disco) e devolve o tamanho; null quando não existe ou é grande demais. */
async function ensureArchive(pkg, { isRoot, skipped }) {
  const target = join(ARCHIVE_DIR, pkg);
  // Os fixados em outro ano sempre são baixados de novo (uma cópia antiga pode ser do ano errado).
  if (existsSync(target) && !(pkg in PINNED_YEARS)) return statSync(target).size;
  const data = await download(pkg);
  if (!data) {
    skipped.push(`${pkg} (não existe no TeX Live ${TEXLIVE_YEAR})`);
    return null;
  }
  if (!isRoot && data.byteLength > MAX_DEPENDENCY_BYTES) {
    skipped.push(`${pkg} (${Math.round(data.byteLength / 1024)} KB, grande demais para dependência)`);
    return null;
  }
  writeFileSync(target, data);
  return data.byteLength;
}

async function main() {
  mkdirSync(ARCHIVE_DIR, { recursive: true });
  rmSync(LOOSE_DIR, { recursive: true, force: true });
  log('Lendo os índices do Siglum e do TeX Live 2025...');
  const [manifest, fileToPackage, tlpdb] = await Promise.all([
    fetchJson(`${SIGLUM_BUNDLES}/file-manifest.json`),
    fetchJson(`${SIGLUM_BUNDLES}/file-to-package.json`),
    loadTlpdb(),
  ]);
  const available = new Set(Object.keys(manifest).map((path) => path.slice(path.lastIndexOf('/') + 1)));
  const { selected, tooLarge } = selectFromCollections(tlpdb, COLLECTIONS, available);
  const roots = new Set([...ROOT_PACKAGES, ...selected]);
  log(`${selected.length} pacotes das coleções, ${ROOT_PACKAGES.length} da lista curada; ${tooLarge.length} grandes demais ficam de fora.`);

  const done = new Map();
  const looseFiles = {};
  const skipped = [];
  let wave = [...roots];
  while (wave.length > 0) {
    const sizes = new Map();
    let count = 0;
    await inPool(wave, CONCURRENCY, async (pkg) => {
      sizes.set(pkg, await ensureArchive(pkg, { isRoot: roots.has(pkg), skipped }));
      count += 1;
      if (count % 250 === 0) log(`  ${count}/${wave.length}`);
    });
    const next = new Set();
    for (const pkg of wave) {
      const size = sizes.get(pkg);
      done.set(pkg, size ?? 0);
      if (!size) continue;
      const { required, loose } = inspectArchive(join(ARCHIVE_DIR, pkg), pkg);
      if (loose.length > 0) looseFiles[pkg] = loose;
      for (const file of required) {
        if (available.has(file)) continue;
        const dependency = fileToPackage[file];
        if (typeof dependency === 'string' && !done.has(dependency) && !roots.has(dependency)) next.add(dependency);
      }
    }
    wave = [...next].filter((pkg) => !done.has(pkg));
  }

  // Arquivos que saíram da seleção não vão para o site.
  for (const name of readdirSync(ARCHIVE_DIR)) if (!done.get(name)) rmSync(join(ARCHIVE_DIR, name), { force: true });

  const packages = [...done].filter(([, size]) => size > 0).sort(([a], [b]) => a.localeCompare(b));
  const totalBytes = packages.reduce((sum, [, size]) => sum + size, 0);
  const content = { texlive: TEXLIVE_YEAR, collections: COLLECTIONS, packages: Object.fromEntries(packages), pinned: PINNED_YEARS, looseFiles };
  // Muda quando o conteúdo muda: o app limpa o cache de pacotes do Siglum no navegador (que
  // guarda até os "não encontrado") para buscar de novo o que foi acrescentado ou trocado.
  const revision = createHash('sha256').update(JSON.stringify(content)).digest('hex').slice(0, 16);
  writeFileSync(join(OUTPUT, 'packages.json'), `${JSON.stringify({ revision, ...content })}\n`);
  const { fileToPackage: fileIndex, fonts } = buildIndexes(tlpdb, packages.map(([name]) => name), available);
  mkdirSync(join(OUTPUT, 'bundles'), { recursive: true });
  writeFileSync(join(OUTPUT, 'bundles', 'file-to-package.json'), `${JSON.stringify(fileIndex)}\n`);
  writeFileSync(join(OUTPUT, 'fonts.json'), `${JSON.stringify(fonts)}\n`);
  log(`índices: ${Object.keys(fileIndex).length} arquivos do TeX, ${Object.values(fonts).flat().length} prefixos de fontes em ${Object.keys(fonts).length} pacotes`);
  log(`${packages.length} pacotes, ${(totalBytes / 1024 / 1024).toFixed(1)} MB em ${ARCHIVE_DIR}`);
  log(`grandes demais (fora): ${tooLarge.join(', ')}`);
  for (const line of skipped) log(`ignorado: ${line}`);
}

// Rodado como script (os testes importam só as funções puras).
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exit(1);
  });
}
