/**
 * Catálogo público de modelos de IA servido pelo próprio site em
 * public/ai-models.json. É o que o campo "Modelo" mostra antes de a pessoa
 * informar a chave; com a chave, a lista vem do próprio provedor.
 *
 * Fonte: models.dev (banco aberto de modelos por provedor, com os nomes da
 * API de cada um). O arquivo inteiro passa de 5 MB, pesado demais para o
 * navegador; aqui ele vira poucos kB, com só os modelos que respondem em
 * texto. Só metadados públicos: nada do usuário sai daqui.
 *
 * Uso: node scripts/ai-models-catalog.mjs   (atrás de proxy: NODE_USE_ENV_PROXY=1)
 * Falha na fonte não derruba o build: o app usa a lista embutida.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const SOURCE = 'https://models.dev/api.json';
const OUTPUT = join(process.cwd(), 'public', 'ai-models.json');
/** Provedor do app e o nome dele no models.dev. */
const PROVIDERS = { anthropic: 'anthropic', openai: 'openai', gemini: 'google' };
const MAX_PER_PROVIDER = 80;

/** Modelos de cada provedor que respondem só em texto, do mais novo para o mais antigo. */
export function buildCatalog(api, now = new Date()) {
  const providers = {};
  for (const [id, sourceId] of Object.entries(PROVIDERS)) {
    const entries = Object.values(api?.[sourceId]?.models ?? {});
    const models = entries
      .filter((model) => {
        const output = model?.modalities?.output;
        return typeof model?.id === 'string' && Array.isArray(output) && output.length === 1 && output[0] === 'text' && model.status !== 'deprecated';
      })
      .map((model) => {
        const released = typeof model.release_date === 'string' ? Date.parse(model.release_date) : Number.NaN;
        return { id: model.id, label: typeof model.name === 'string' ? model.name : null, released: Number.isNaN(released) ? null : released };
      })
      .sort((a, b) => (b.released ?? 0) - (a.released ?? 0) || a.id.localeCompare(b.id))
      .slice(0, MAX_PER_PROVIDER);
    if (models.length > 0) providers[id] = models;
  }
  return { generatedAt: now.toISOString(), source: SOURCE, providers };
}

async function main() {
  try {
    const response = await fetch(SOURCE, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`${SOURCE}: ${response.status}`);
    const catalog = buildCatalog(await response.json());
    const counts = Object.entries(catalog.providers).map(([id, models]) => `${id} ${models.length}`);
    if (counts.length === 0) throw new Error('nenhum modelo reconhecido na fonte');
    mkdirSync(join(process.cwd(), 'public'), { recursive: true });
    writeFileSync(OUTPUT, `${JSON.stringify(catalog)}\n`);
    process.stdout.write(`Catálogo de modelos: ${counts.join(', ')} em ${OUTPUT}\n`);
  } catch (error) {
    process.stdout.write(`Aviso: catálogo de modelos não gerado (${error?.message ?? error}); o app usa a lista embutida.\n`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
