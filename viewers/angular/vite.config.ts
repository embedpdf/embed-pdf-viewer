/// <reference types="vitest" />
import { defineConfig } from 'vite';
import { resolve } from 'path';
import angular from '@analogjs/vite-plugin-angular';
import dts from 'unplugin-dts/vite';

export default defineConfig({
  resolve: {
    mainFields: ['module'],
  },
  plugins: [
    ...angular({
      tsconfig: resolve(__dirname, 'tsconfig.json'),
    }),
    dts({
      tsconfigPath: resolve(__dirname, 'tsconfig.json'),
      exclude: ['**/*.spec.ts', '**/test-setup.ts'],
    }),
  ],
  build: {
    target: ['esnext'],
    sourcemap: true,
    minify: false,
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es', 'cjs'],
      fileName: (format) => `index.${format === 'es' ? 'js' : 'cjs'}`,
    },
    rollupOptions: {
      external: [/^@angular($|\/)/, /^rxjs($|\/)/, 'tslib', /^@embedpdf\//],
      output: {
        preserveModules: false,
      },
    },
  },
  test: {
    name: 'angular',
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
    include: ['src/**/*.{test,spec}.ts'],
    exclude: ['**/*.browser.spec.ts', 'node_modules/**'],
  },
});
