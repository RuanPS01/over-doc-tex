/**
 * Verifica o contrato de responsividade (docs/08-responsividade.md) no build de produção:
 * - nenhuma rolagem horizontal no body em 360px, paisagem curta, tablet e desktop;
 * - a raiz do editor ocupa exatamente a altura visível (h-viewport);
 * - no celular em retrato, apenas um painel (Código OU PDF) fica visível;
 * - o menu "Mais ações" cabe na tela de 360px.
 *
 * Uso: npm run build && npm run check:responsive
 * Requer o pacote `playwright` com Chromium instalado (npx playwright install chromium).
 */
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { preview } from 'vite';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('Pacote "playwright" não encontrado. Instale com: npm i -D playwright && npx playwright install chromium');
  process.exit(1);
}

const VIEWPORTS = [
  { name: 'celular-retrato-360', width: 360, height: 740, mode: 'mobile-portrait' },
  { name: 'celular-paisagem', width: 740, height: 360, mode: 'mobile-landscape' },
  { name: 'tablet-retrato', width: 768, height: 1024, mode: 'mobile-portrait' },
  { name: 'desktop', width: 1280, height: 800, mode: 'desktop' },
];
const ROUTES = ['/', '/login', '/p/demo'];
const outDir = process.env.SCREENSHOT_DIR ?? 'dist-screenshots';
mkdirSync(outDir, { recursive: true });

const server = await preview({ preview: { port: 4173, strictPort: true }, logLevel: 'silent' });
const browser = await chromium.launch();
const failures = [];

for (const viewport of VIEWPORTS) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const page = await context.newPage();

  for (const route of ROUTES) {
    await page.goto(`http://localhost:4173${route}`, { waitUntil: 'networkidle' });
    const label = `${viewport.name} ${route}`;

    const overflow = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
      width: window.innerWidth,
    }));
    if (overflow.doc > overflow.width || overflow.body > overflow.width) {
      failures.push(`${label}: rolagem horizontal (${overflow.doc}px > ${overflow.width}px)`);
    }

    if (route === '/p/demo') {
      const rootHeight = await page.evaluate(() => document.querySelector('.h-viewport')?.getBoundingClientRect().height);
      if (Math.round(rootHeight ?? 0) !== viewport.height) {
        failures.push(`${label}: raiz do editor com ${rootHeight}px em vez de ${viewport.height}px`);
      }

      const visible = await page.evaluate(() =>
        ['Editor de código', 'Pré-visualização do PDF'].filter((name) => {
          const el = document.querySelector(`[aria-label="${name}"]`);
          return el && el.getClientRects().length > 0;
        }),
      );
      const expected = viewport.mode === 'mobile-portrait' ? 1 : 2;
      if (visible.length !== expected) {
        failures.push(`${label}: ${visible.length} painéis visíveis, esperado ${expected}`);
      }

      if (viewport.width === 360) {
        await page.getByRole('button', { name: 'Mais ações' }).click();
        const menu = await page.getByRole('menu').boundingBox();
        if (!menu || menu.x < 0 || menu.x + menu.width > viewport.width) {
          failures.push(`${label}: menu "Mais ações" fora da tela`);
        }
        await page.screenshot({ path: `${outDir}/${viewport.name}-menu.png` });
        await page.keyboard.press('Escape');
      }
    }

    await page.screenshot({ path: `${outDir}/${viewport.name}${route.replace(/\//g, '_')}.png` });
  }
  await context.close();
}

await browser.close();
await server.close();

if (failures.length > 0) {
  console.error(`Falhas de responsividade:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`Contrato de responsividade OK em ${VIEWPORTS.length} viewports e ${ROUTES.length} rotas.`);
