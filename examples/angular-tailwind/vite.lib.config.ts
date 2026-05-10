import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import angular from '@analogjs/vite-plugin-angular';
import tailwindcss from '@tailwindcss/vite';
import { glob } from 'glob';
import dts from 'vite-plugin-dts';

export default defineConfig({
  resolve: {
    mainFields: ['module'],
  },
  plugins: [
    ...angular({
      tsconfig: resolve(__dirname, 'tsconfig.lib.json'),
    }),
    tailwindcss(),
    dts({
      tsconfigPath: './tsconfig.lib.json',
      rollupTypes: false,
      entryRoot: 'src/examples',
      outDir: 'dist/examples',
      include: ['src/examples/**/*.ts'],
    }),
  ],
  build: {
    outDir: 'dist/examples',
    sourcemap: true,
    emptyOutDir: true,
    target: 'esnext',
    minify: false,
    lib: {
      entry: Object.fromEntries(
        glob
          .sync('src/examples/**/*.ts')
          .map((file) => [
            file.slice('src/examples/'.length, file.length - '.ts'.length),
            fileURLToPath(new URL(file, import.meta.url)),
          ]),
      ),
      formats: ['es'],
    },
    rollupOptions: {
      external: (id: string) => {
        if (/^@angular($|\/)/.test(id)) return true;
        if (/^rxjs($|\/)/.test(id) || id === 'tslib') return true;
        if (/^@embedpdf\/(?!angular-pdf-viewer)/.test(id)) return true;
        return false;
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
      },
    },
  },
});
