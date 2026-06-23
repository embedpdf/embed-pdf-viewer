import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import angular from '@analogjs/vite-plugin-angular';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    ...angular({
      tsconfig: resolve(__dirname, 'tsconfig.json'),
    }),
    tailwindcss(),
  ],
  server: {
    host: '127.0.0.1',
    port: 4301,
    open: true,
    cors: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 4301,
    cors: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'esnext',
    minify: false,
    cssCodeSplit: false,
  },
  optimizeDeps: {
    exclude: ['@embedpdf/engines'],
  },
});
