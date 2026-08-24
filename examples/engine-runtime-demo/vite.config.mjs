import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  optimizeDeps: { exclude: ['@embedpdf/engine-runtime-wasm32'] },
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        engine: resolve(import.meta.dirname, 'engine.html'),
        annotations: resolve(import.meta.dirname, 'annotations.html'),
        mutations: resolve(import.meta.dirname, 'mutations.html'),
        pages: resolve(import.meta.dirname, 'pages.html'),
      },
    },
  },
});
