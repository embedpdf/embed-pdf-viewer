/**
 * The library build: one entry per feature, read from the `exports` map in
 * package.json (`"./stage": "./src/stage.ts"` builds `dist/stage.js` and
 * `dist/stage.cjs`), so adding an entry is adding its file and its export line.
 * Vue and every `@embedpdf/*` package stay imports. Declarations come from
 * `vue-tsc -p tsconfig.build.json`, run after this build.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));
const manifest = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  exports: Record<string, string>;
};

/** `"./stage": "./src/stage.ts"` → `{ stage: '<root>/src/stage.ts' }`; `"."` is `index`. */
const entries = Object.fromEntries(
  Object.entries(manifest.exports)
    .filter(([, source]) => source.startsWith('./src/'))
    .map(([subpath, source]) => [subpath === '.' ? 'index' : subpath.slice(2), root + source]),
);

export default defineConfig({
  plugins: [vue()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    minify: false,
    lib: {
      entry: entries,
      formats: ['es', 'cjs'],
      fileName: (format, name) => `${name}.${format === 'es' ? 'js' : 'cjs'}`,
    },
    rollupOptions: {
      external: (id) => id === 'vue' || id.startsWith('@embedpdf/'),
    },
  },
});
