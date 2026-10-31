import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

// Configuração própria (sem o plugin do PWA): os testes unitários rodam em Node.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
