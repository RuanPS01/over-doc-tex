import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Subcaminho de publicação. No GitHub Pages de projeto é "/<repositório>/"; o
// workflow de deploy injeta o valor via BASE_PATH. Localmente fica na raiz.
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg'],
      manifest: {
        name: 'OverDocTeX',
        short_name: 'OverDocTeX',
        description: 'Editor LaTeX com revisão por versões, diff visual em PDF e assistente de IA.',
        lang: 'pt-BR',
        display: 'standalone',
        orientation: 'any',
        start_url: base,
        scope: base,
        // Única exceção à regra de cores por token: o manifesto exige valores literais.
        // Os valores espelham --primary (#171717) e --background (#fafafa) de src/styles/globals.css.
        theme_color: 'hsl(0 0% 9%)',
        background_color: 'hsl(0 0% 98%)',
        icons: [{ src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        navigateFallbackDenylist: [/^\/api\//, /^\/__\//],
        runtimeCaching: [
          {
            // O Monaco é carregado sob demanda do CDN e fica em cache para uso offline.
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/npm\/monaco-editor@/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'monaco-editor',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  build: {
    // O SDK do Firebase (auth + firestore) é o maior pedaço de fornecedor.
    // Carregar o Firestore sob demanda está em docs/10-manutencao-e-granularidade.md.
    chunkSizeWarningLimit: 700,
    rolldownOptions: {
      output: {
        // Bibliotecas grandes em chunks próprios: mudam pouco e ficam em cache entre deploys.
        codeSplitting: {
          groups: [
            { name: 'vendor-firebase', test: /node_modules[\\/](@firebase|firebase)[\\/]/ },
            { name: 'vendor-react', test: /node_modules[\\/](react|react-dom|scheduler|wouter|@tanstack)[\\/]/ },
            { name: 'vendor-ui', test: /node_modules[\\/](@radix-ui|lucide-react|react-resizable-panels)[\\/]/ },
          ],
        },
      },
    },
  },
  resolve: {
    alias: [
      { find: '@shared', replacement: fileURLToPath(new URL('./shared', import.meta.url)) },
      { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
      // Worker do compilador LaTeX: o pacote não o exporta, e o Siglum precisa da URL dele.
      // Expressão regular para casar também o sufixo ?url.
      {
        find: /^siglum-worker(\?url)?$/,
        replacement: `${fileURLToPath(new URL('./node_modules/@siglum/engine/src/worker.js', import.meta.url))}$1`,
      },
      // A blake3-wasm não empacota; sem ela o Siglum usa um hash próprio (ver o arquivo).
      {
        find: /^blake3-wasm\/browser\.js$/,
        replacement: fileURLToPath(new URL('./src/lib/latex/blake3-unavailable.ts', import.meta.url)),
      },
    ],
  },
});
