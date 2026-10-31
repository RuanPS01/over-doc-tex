/**
 * SyncTeX (puro): liga posições do PDF a linhas do código. O pdfTeX do Siglum
 * gera o arquivo sem compressão (--synctex=-1); aqui ele vira um formato
 * compacto, já com os caminhos do projeto e as linhas do arquivo principal
 * corrigidas, que é o que a versão guarda (`{documentId}.synctex`).
 */

/** Registro em pontos do PDF (1/72 pol.), origem no canto superior esquerdo; y é a linha de base. */
export interface SyncRecord {
  file: number;
  line: number;
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
}

export interface SyncData {
  /** Caminhos do projeto; os índices aparecem em `SyncRecord.file`. */
  files: string[];
  /** pages[0] é a página 1. */
  pages: SyncRecord[][];
}

/** 1 bp em sp (scaled points do TeX): 65536 * 72,27 / 72. */
const SP_PER_BP = 65781.76;

export interface ParseOptions {
  /** Converte o caminho do SyncTeX para o caminho no projeto; nulo descarta (pacotes do TeX Live). */
  toProjectPath: (raw: string) => string | null;
  /** Linhas a somar em cada arquivo (o principal pode chegar ao TeX sem o preâmbulo). */
  lineOffset: (path: string) => number;
}

/** Lê o texto do .synctex e guarda só o que pertence ao projeto. */
export function parseSynctex(text: string, { toProjectPath, lineOffset }: ParseOptions): SyncData {
  const files: string[] = [];
  const fileIndex = new Map<string, number>();
  const tags = new Map<number, { index: number; offset: number }>();
  const pages: SyncRecord[][] = [];
  let unit = 1;
  let magnification = 1000;
  let xOffset = 0;
  let yOffset = 0;
  let current: SyncRecord[] | null = null;
  const scale = () => (unit * magnification) / 1000 / SP_PER_BP;

  for (const line of text.split('\n')) {
    if (line.startsWith('Input:')) {
      const match = line.match(/^Input:(\d+):(.*)$/);
      const path = match ? toProjectPath(match[2]!.trim()) : null;
      if (match && path) {
        let index = fileIndex.get(path);
        if (index === undefined) {
          index = files.length;
          files.push(path);
          fileIndex.set(path, index);
        }
        tags.set(Number(match[1]), { index, offset: lineOffset(path) });
      }
    } else if (line.startsWith('Unit:')) unit = Number(line.slice(5)) || 1;
    else if (line.startsWith('Magnification:')) magnification = Number(line.slice(14)) || 1000;
    else if (line.startsWith('X Offset:')) xOffset = Number(line.slice(9)) || 0;
    else if (line.startsWith('Y Offset:')) yOffset = Number(line.slice(9)) || 0;
    else if (line.startsWith('{')) {
      const page = Number(line.slice(1));
      current = [];
      pages[page - 1] = current;
    } else if (line.startsWith('}')) current = null;
    else if (current) {
      // h, (, [ trazem caixa (largura, altura, profundidade); x, k, g, $ são pontos.
      const match = line.match(/^([hvx(\[kg$])(\d+),(-?\d+)(?:,-?\d+)?:(-?\d+),(-?\d+)(?::(-?\d+)(?:,(-?\d+),(-?\d+))?)?/);
      if (!match) continue;
      const tag = tags.get(Number(match[2]));
      if (!tag) continue;
      const kind = match[1]!;
      // Caixas verticais (páginas, listas inteiras) contêm tudo e só atrapalham a busca.
      if (kind === '[' || kind === 'v') continue;
      const isBox = kind === 'h' || kind === '(';
      const s = scale();
      current.push({
        file: tag.index,
        line: Math.max(1, Number(match[3]) + tag.offset),
        x: (Number(match[4]) + xOffset) * s,
        y: (Number(match[5]) + yOffset) * s,
        width: isBox ? Number(match[6] ?? 0) * s : 0,
        height: isBox ? Number(match[7] ?? 0) * s : 0,
        depth: isBox ? Number(match[8] ?? 0) * s : 0,
      });
    }
  }
  for (let index = 0; index < pages.length; index++) pages[index] ??= [];
  return { files, pages: pages.map(dedupe) };
}

/** Distância mínima, na mesma linha, entre pontos guardados do mesmo arquivo e linha do código. */
const POINT_SPACING = 20;

/**
 * Pontos seguidos da mesma origem na mesma altura: guarda um a cada 20 pt,
 * o bastante para achar a palavra clicada sem guardar cada letra.
 */
function dedupe(records: SyncRecord[]): SyncRecord[] {
  const out: SyncRecord[] = [];
  let kept: SyncRecord | null = null;
  for (const record of records) {
    const sameRun = kept && record.width === 0 && kept.width === 0 && kept.file === record.file && kept.line === record.line && Math.abs(kept.y - record.y) < 0.5;
    if (sameRun && Math.abs(record.x - kept!.x) < POINT_SPACING) continue;
    out.push(record);
    if (record.width === 0) kept = record;
  }
  return out;
}

/**
 * Busca reversa: o ponto clicado (em pontos do PDF) vira arquivo e linha do
 * código. A caixa da linha diz onde o parágrafo terminou (às vezes no arquivo
 * que fez o \input); os registros de caractere, espaço e kern dentro dela
 * guardam a origem real, então ganham dela.
 */
export function sourceAt(data: SyncData, page: number, x: number, y: number): { path: string; line: number } | null {
  const records = data.pages[page - 1] ?? [];
  const boxes = records.filter((record) => record.width > 0);
  // A linha clicada: a menor caixa que contém o ponto; entre duas linhas, a mais próxima na vertical.
  let box: SyncRecord | null = null;
  let boxScore = Number.POSITIVE_INFINITY;
  for (const record of boxes) {
    const top = record.y - record.height;
    const bottom = record.y + record.depth;
    const dy = y < top ? top - y : y > bottom ? y - bottom : 0;
    const dx = x < record.x ? record.x - x : x > record.x + record.width ? x - record.x - record.width : 0;
    const score = (dx + dy) * 1000 + record.width * (record.height + record.depth) / 1000;
    if (score < boxScore) {
      box = record;
      boxScore = score;
    }
  }
  let best: SyncRecord | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const record of records) {
    if (record.width !== 0) continue;
    if (box && (record.y < box.y - box.height - 0.5 || record.y > box.y + box.depth + 0.5)) continue;
    const distance = box ? Math.abs(record.x - x) : Math.abs(record.x - x) + Math.abs(record.y - y) * 2;
    if (distance < bestDistance) {
      best = record;
      bestDistance = distance;
    }
  }
  best ??= box;
  return best ? { path: data.files[best.file]!, line: best.line } : null;
}

/** Busca direta: a linha do código vira página e posição no PDF (a linha mais próxima que gerou algo). */
export function pdfAt(data: SyncData, path: string, line: number): { page: number; x: number; y: number } | null {
  const file = data.files.indexOf(path);
  if (file === -1) return null;
  let found: { page: number; record: SyncRecord; distance: number } | null = null;
  data.pages.forEach((records, index) => {
    for (const record of records) {
      if (record.file !== file) continue;
      // Linhas antes da pedida ganham dos que vêm depois: o texto da linha começa num registro anterior.
      const distance = record.line <= line ? line - record.line : (record.line - line) * 4 + 0.5;
      if (!found || distance < found.distance || (distance === found.distance && index + 1 === found.page && record.y < found.record.y)) {
        found = { page: index + 1, record, distance };
      }
    }
  });
  const result = found as { page: number; record: SyncRecord; distance: number } | null;
  return result ? { page: result.page, x: result.record.x, y: result.record.y - result.record.height } : null;
}

/** Formato compacto guardado com a versão (JSON com números arredondados). */
export function encodeSyncData(data: SyncData): string {
  const round = (value: number) => Math.round(value * 10) / 10;
  return JSON.stringify({
    v: 1,
    files: data.files,
    pages: data.pages.map((records) =>
      records.map((record) => [record.file, record.line, round(record.x), round(record.y), round(record.width), round(record.height), round(record.depth)]),
    ),
  });
}

export function decodeSyncData(json: string): SyncData {
  const parsed = JSON.parse(json) as { files?: unknown; pages?: unknown };
  const files = Array.isArray(parsed.files) ? parsed.files.filter((file): file is string => typeof file === 'string') : [];
  const pages = Array.isArray(parsed.pages)
    ? parsed.pages.map((records) =>
        Array.isArray(records)
          ? records
              .filter((record): record is number[] => Array.isArray(record) && record.length === 7)
              .map(([file, line, x, y, width, height, depth]) => ({ file: file!, line: line!, x: x!, y: y!, width: width!, height: height!, depth: depth! }))
          : [],
      )
    : [];
  return { files, pages };
}
