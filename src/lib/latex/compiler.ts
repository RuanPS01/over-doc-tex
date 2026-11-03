/**
 * Compilação LaTeX no navegador com o Siglum (TeX Live 2025 em WebAssembly).
 * O motor (cerca de 30 MB) e os conjuntos de pacotes vêm da CDN do Siglum na
 * primeira compilação e ficam em cache no navegador; pacotes que não estão
 * nesses conjuntos vêm do repositório estático do próprio site
 * (public/texlive, gerado por scripts/latex-packages.mjs).
 *
 * Não exige isolamento entre origens (COOP/COEP): sem SharedArrayBuffer o
 * Siglum copia os dados entre a página e o worker, um pouco mais devagar.
 */
import siglumWorkerUrl from 'siglum-worker?url';
import type { SiglumCompiler } from '@siglum/engine';
import { t } from '@/lib/i18n';
import { mainLineOffset, missingFonts, parseTexLog, projectPathFromTex, type CompileInput, type TexIssue } from './prepare';
import { parseSynctex, type SyncData } from './synctex';
import { fetchLooseFiles, fontPackagesFor, installTexliveFetchGuard, texliveRevision } from './texlive-files';

const SIGLUM_CDN = 'https://cdn.siglum.org/tl2025';

export type CompileStage = 'engine' | 'packages' | 'compiling';

export interface LatexCompileResult {
  ok: boolean;
  pdf: Uint8Array | null;
  issues: TexIssue[];
  durationMs: number;
  /** Mapa PDF e código; nulo se o TeX não gerou o SyncTeX. */
  synctex: SyncData | null;
}

let compilerPromise: Promise<SiglumCompiler> | null = null;
let compilerReady = false;
let logLines: string[] = [];
/** Mensagens do próprio worker (não do TeX), que dizem se o texto foi alterado. */
let workerNotes: string[] = [];
let stageListener: ((stage: CompileStage) => void) | null = null;
/** Nova tentativa anunciada pelo Siglum; o log recomeça na primeira linha do TeX dela. */
let retryPending = false;
let retryNotesFrom = 0;

/**
 * Pacotes do TeX Live com as fontes de pacotes de fontes cujo .sty já vem no
 * Siglum (os do psnfss): o .sty carrega, mas as métricas (ptmr7t.tfm) e os
 * contornos (utmr8a.pfb) estão em outro pacote. Buscados antes de compilar,
 * evitam uma compilação perdida. Outras fontes que faltarem são achadas
 * depois pelo índice de fontes (fonts.json).
 */
const FONT_PACKAGE_HINTS: Record<string, readonly string[]> = {
  times: ['times'],
  mathptmx: ['times'],
  mathptm: ['times'],
  helvet: ['helvetic'],
  courier: ['courier'],
  palatino: ['palatino'],
  mathpazo: ['palatino', 'fpl'],
  chancery: ['zapfchan'],
  bookman: ['bookman'],
  avant: ['avantgar'],
  newcent: ['ncntrsbk'],
  charter: ['charter'],
  utopia: ['utopia'],
  fourier: ['fourier', 'utopia'],
};

/** Até quantas vezes compila de novo depois de buscar pacotes de fontes que faltaram. */
const MAX_FONT_ROUNDS = 3;

/** Pacotes de fontes já buscados nesta aba: entram de saída nas próximas compilações. */
const sessionFontPackages = new Set<string>();

async function loadCompiler(): Promise<SiglumCompiler> {
  installTexliveFetchGuard();
  const [{ SiglumCompiler: Compiler }, xzwasm] = await Promise.all([import('@siglum/engine'), import('xzwasm')]);
  // O Siglum descompacta os pacotes do TeX Live (.tar.xz) com a xzwasm global.
  (self as unknown as { xzwasm: unknown }).xzwasm = xzwasm.default ?? xzwasm;

  const compiler = new Compiler({
    bundlesUrl: `${SIGLUM_CDN}/bundles`,
    wasmUrl: `${SIGLUM_CDN}/busytex.wasm`,
    workerUrl: siglumWorkerUrl,
    ctanProxyUrl: new URL(`${import.meta.env.BASE_URL}texlive`, window.location.origin).href,
    // Cada pacote que falta custa uma tentativa (o Siglum busca o conjunto ou o pacote e roda de novo);
    // dependências de pacotes vindos do repositório do site (que o Siglum não conhece) chegam em cadeia.
    maxRetries: 20,
    // O texto do TeX é a única fonte dos erros com linha; vai para um vetor, sem tocar no DOM.
    verbose: true,
    onLog: (message) => {
      const text = String(message);
      // Depuração: VITE_SIGLUM_DEBUG=true no build copia o log do compilador para o console.
      if (import.meta.env.VITE_SIGLUM_DEBUG === 'true') console.debug('[siglum]', text);
      if (text.startsWith('[TeX] ')) {
        // O Siglum tenta de novo depois de buscar um pacote que faltava; os erros das tentativas
        // anteriores ("File `x' not found") deixam de valer quando a nova tentativa começa. Se a
        // busca falha, ele desiste sem rodar o TeX e o log da última tentativa fica como está.
        if (retryPending) {
          logLines = [];
          workerNotes = workerNotes.slice(retryNotesFrom);
          retryPending = false;
        }
        logLines.push(text.slice(6));
      } else {
        if (/^\[RETRY\] missingFiles=(?!none)/.test(text)) {
          retryPending = true;
          retryNotesFrom = workerNotes.length;
        }
        workerNotes.push(text);
      }
    },
    onProgress: (stage) => {
      if (stage === 'loading' || stage === 'mount') stageListener?.('packages');
      if (stage === 'compiling' || stage === 'compile') stageListener?.('compiling');
    },
  });
  await compiler.init();
  await refreshPackageCache(compiler);
  compilerReady = true;
  return compiler;
}

const REVISION_KEY = 'overdoctex.texlive-revision';

/**
 * O Siglum guarda no navegador cada pacote que buscou, inclusive os que não
 * achou. Quando o repositório do site muda (pacote novo ou trocado), esse
 * cache esconderia a mudança: limpa uma vez e os pacotes voltam a ser buscados.
 */
async function refreshPackageCache(compiler: SiglumCompiler): Promise<void> {
  const revision = await texliveRevision();
  if (!revision) return;
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(REVISION_KEY);
  } catch {
    // Armazenamento bloqueado: limpar toda vez seria caro; segue com o cache como está.
    return;
  }
  if (stored === revision) return;
  await compiler.clearCache();
  try {
    window.localStorage.setItem(REVISION_KEY, revision);
  } catch {
    // Sem onde guardar: na próxima aba limpa de novo, o que só custa baixar os pacotes outra vez.
  }
}

/** Baixa e inicia o motor uma vez por aba; falha libera nova tentativa. */
function getCompiler(): Promise<SiglumCompiler> {
  compilerPromise ??= loadCompiler().catch((error: unknown) => {
    compilerPromise = null;
    throw error;
  });
  return compilerPromise;
}

/** Uma compilação por vez: o Siglum usa um único worker. */
let queue: Promise<unknown> = Promise.resolve();

export function compileLatex(
  input: CompileInput,
  mainPath: string,
  onStage: (stage: CompileStage) => void,
): Promise<LatexCompileResult> {
  const run = async (): Promise<LatexCompileResult> => {
    const started = performance.now();
    stageListener = onStage;
    // Só a primeira compilação da aba baixa o motor (depois ele fica em memória e em cache).
    if (!compilerReady) onStage('engine');
    try {
      const [compiler, looseFiles] = await Promise.all([getCompiler(), fetchLooseFiles(input.texlivePackages, input.texliveFiles)]);
      // Arquivos do projeto ganham dos soltos de mesmo nome.
      const additionalFiles: Record<string, string | Uint8Array> = { ...looseFiles, ...input.additionalFiles };
      if (input.biblatexBbl) {
        // biblatex: o .bbl sai das citações, dos .bib e das opções do estilo (lidas dos .bbx e .cbx que chegaram).
        const decoder = new TextDecoder();
        const styleFile = (name: string) => {
          const file = additionalFiles[name];
          return file === undefined ? null : typeof file === 'string' ? file : decoder.decode(file);
        };
        try {
          const bibliography = input.biblatexBbl(styleFile);
          if (bibliography) additionalFiles['document.bbl'] = bibliography.bbl;
        } catch (error) {
          // Um .bib que o leitor não entende não pode impedir a compilação: o documento sai, sem a bibliografia.
          console.error('[biblatex]', error);
        }
      }
      const hints = [...new Set([...sessionFontPackages, ...input.texlivePackages.flatMap((pkg) => FONT_PACKAGE_HINTS[pkg] ?? [])])];
      if (hints.length > 0) await compiler.ctanFetcher.batchFetchPackages(hints);
      // useCache: false porque o cache do Siglum usa só o texto do principal como chave: mudar um
      // arquivo de \input devolveria o PDF antigo (e sem SyncTeX).
      const compileOnce = () => {
        logLines = [];
        workerNotes = [];
        retryPending = false;
        onStage('compiling');
        return compiler.compile(input.source, { engine: 'pdflatex', additionalFiles, useCache: false });
      };
      let result = await compileOnce();
      // Fonte que faltou (o Siglum não sabe de que pacote ela vem): acha o pacote pelo índice, busca e compila de novo.
      for (let round = 0; round < MAX_FONT_ROUNDS; round++) {
        const packages = (await fontPackagesFor(missingFonts(logLines))).filter((pkg) => !sessionFontPackages.has(pkg));
        if (packages.length === 0) break;
        packages.forEach((pkg) => sessionFontPackages.add(pkg));
        onStage('packages');
        await compiler.ctanFetcher.batchFetchPackages(packages);
        result = await compileOnce();
      }
      const lineOffset = mainLineOffset(input.source, workerNotes);
      const issues = parseTexLog(logLines, mainPath, lineOffset);
      const pdf = result.success && result.pdf ? new Uint8Array(result.pdf) : null;
      const rawSynctex = (result as { syncTexData?: string | null }).syncTexData ?? null;
      const synctex =
        pdf && rawSynctex
          ? parseSynctex(rawSynctex, {
              toProjectPath: (raw) => projectPathFromTex(raw, mainPath),
              lineOffset: (path) => (path === mainPath ? lineOffset : 0),
            })
          : null;
      if (!pdf && !issues.some((issue) => issue.kind !== 'warning')) {
        issues.unshift({ kind: 'error', message: result.error ?? t('A compilação falhou sem mensagem do TeX.'), file: null, line: null });
      }
      return { ok: pdf !== null, pdf, issues, durationMs: Math.round(performance.now() - started), synctex };
    } finally {
      stageListener = null;
    }
  };
  const next = queue.then(run, run);
  queue = next.catch(() => undefined);
  return next;
}
