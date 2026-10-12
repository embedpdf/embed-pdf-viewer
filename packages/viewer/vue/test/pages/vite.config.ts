/**
 * Builds the test pages into `test/pages/dist` against the npm build of `@embedpdf/viewer`
 * (`packages/viewer/main/dist`), which leaves the shared `@embedpdf/*` packages to this
 * bundler, as an app installed from npm does; the wrapper comes from its source. A development
 * build, so the wrapper's development warnings are there to check.
 */
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../../../..');
const viewerDist = join(repo, 'packages/viewer/main/dist');

/** The pages, by name: `<name>.html` next to this file. */
export const PAGES = ['hooks', 'live-props', 'components', 'viewer-code'] as const;

export default defineConfig({
  root: here,
  mode: 'development',
  logLevel: 'warn',
  plugins: [vue()],
  resolve: {
    alias: [
      { find: /^@embedpdf\/viewer$/, replacement: join(viewerDist, 'index.js') },
      { find: /^@embedpdf\/viewer\/core$/, replacement: join(viewerDist, 'core.js') },
      {
        find: /^@embedpdf\/viewer-vue$/,
        replacement: join(repo, 'packages/viewer/vue/src/index.ts'),
      },
    ],
    // The wrapper's `@embedpdf/vue` and the pages' own are one copy, as in an app.
    dedupe: ['@embedpdf/vue', 'vue'],
  },
  build: {
    outDir: join(here, 'dist'),
    emptyOutDir: true,
    minify: false,
    rollupOptions: {
      input: Object.fromEntries(PAGES.map((page) => [page, join(here, `${page}.html`)])),
    },
  },
});
