import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
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
        start_url: '/',
        scope: '/',
        // Única exceção à regra de cores por token: o manifesto exige valores literais.
        // Os valores espelham --foreground e --background de src/styles/globals.css.
        theme_color: 'hsl(222 47% 11%)',
        background_color: 'hsl(0 0% 100%)',
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
    // O SDK do Firebase (auth + firestore + storage) ocupa ~650 kB sozinho.
    // Carregar Storage e Firestore sob demanda está em docs/10-manutencao-e-granularidade.md.
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
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
});
