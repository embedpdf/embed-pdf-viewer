import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import angular from '@analogjs/vite-plugin-angular';

export default defineConfig({
  plugins: [
    ...angular({
      tsconfig: resolve(__dirname, 'tsconfig.json'),
    }),
  ],
  server: {
    host: '127.0.0.1',
    port: 4300,
  },
  preview: {
    host: '127.0.0.1',
    port: 4300,
  },
  optimizeDeps: {
    exclude: ['@embedpdf/engines'],
  },
});
