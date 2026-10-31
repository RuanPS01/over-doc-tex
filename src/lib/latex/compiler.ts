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
import { mainLineOffset, parseTexLog, projectPathFromTex, type CompileInput, type TexIssue } from './prepare';
import { parseSynctex, type SyncData } from './synctex';

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

async function loadCompiler(): Promise<SiglumCompiler> {
  const [{ SiglumCompiler: Compiler }, xzwasm] = await Promise.all([import('@siglum/engine'), import('xzwasm')]);
  // O Siglum descompacta os pacotes do TeX Live (.tar.xz) com a xzwasm global.
  (self as unknown as { xzwasm: unknown }).xzwasm = xzwasm.default ?? xzwasm;

  const compiler = new Compiler({
    bundlesUrl: `${SIGLUM_CDN}/bundles`,
    wasmUrl: `${SIGLUM_CDN}/busytex.wasm`,
    workerUrl: siglumWorkerUrl,
    ctanProxyUrl: new URL(`${import.meta.env.BASE_URL}texlive`, window.location.origin).href,
    maxRetries: 8,
    // O texto do TeX é a única fonte dos erros com linha; vai para um vetor, sem tocar no DOM.
    verbose: true,
    onLog: (message) => {
      const text = String(message);
      if (text.startsWith('[TeX] ')) logLines.push(text.slice(6));
      else workerNotes.push(text);
    },
    onProgress: (stage) => {
      if (stage === 'loading' || stage === 'mount') stageListener?.('packages');
      if (stage === 'compiling' || stage === 'compile') stageListener?.('compiling');
    },
  });
  await compiler.init();
  compilerReady = true;
  return compiler;
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
      const compiler = await getCompiler();
      logLines = [];
      workerNotes = [];
      onStage('compiling');
      // useCache: false porque o cache do Siglum usa só o texto do principal como chave: mudar um
      // arquivo de \input devolveria o PDF antigo (e sem SyncTeX).
      const result = await compiler.compile(input.source, { engine: 'pdflatex', additionalFiles: input.additionalFiles, useCache: false });
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
        issues.unshift({ kind: 'error', message: result.error ?? 'A compilação falhou sem mensagem do TeX.', file: null, line: null });
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
