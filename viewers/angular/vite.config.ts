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
      exclude: ['**/*.spec.ts', '**/*.test-d.ts', '**/test-setup.ts'],
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
      // Suppress Rollup's UNUSED_EXTERNAL_IMPORT warning from @angular/core.
      // Analog's AOT transform rewrites `@Component`/`ChangeDetectionStrategy`
      // references into `ɵɵdefineComponent` calls, leaving the original named
      // imports tree-shake-eligible. The emitted bundle is correct.
      onwarn(warning, defaultHandler) {
        if (
          warning.code === 'UNUSED_EXTERNAL_IMPORT' &&
          typeof warning.exporter === 'string' &&
          warning.exporter.startsWith('@angular/')
        ) {
          return;
        }
        defaultHandler(warning);
      },
    },
  },
});
