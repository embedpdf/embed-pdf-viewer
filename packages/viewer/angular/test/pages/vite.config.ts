/**
 * Builds the test pages into `test/pages/dist` against the npm builds of `@embedpdf/viewer`
 * (`packages/viewer/main/dist`) and of this package (`dist`), which leave the shared
 * `@embedpdf/*` packages to this bundler, as an app installed from npm does. The pages compile
 * just in time in the browser (`@angular/compiler`), and so do the packages' partial
 * declarations: no Angular build step. A development build, so the wrapper's development
 * warnings are there to check.
 */
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../../../..');
const viewerDist = join(repo, 'packages/viewer/main/dist');
const wrapperDist = join(repo, 'packages/viewer/angular/dist/fesm2022');

/** The pages, by name: `<name>.html` next to this file. */
export const PAGES = ['hooks', 'live-props', 'components', 'viewer-code', 'zoom'] as const;

export default defineConfig({
  root: here,
  mode: 'development',
  logLevel: 'warn',
  resolve: {
    alias: [
      { find: /^@embedpdf\/viewer$/, replacement: join(viewerDist, 'index.js') },
      { find: /^@embedpdf\/viewer\/core$/, replacement: join(viewerDist, 'core.js') },
      {
        find: /^@embedpdf\/viewer-angular$/,
        replacement: join(wrapperDist, 'embedpdf-viewer-angular.mjs'),
      },
      {
        find: /^@embedpdf\/viewer-angular\/(core|component)$/,
        replacement: join(wrapperDist, 'embedpdf-viewer-angular-$1.mjs'),
      },
    ],
    // The wrapper's `@embedpdf/angular` and the pages' own are one copy, as in an app.
    dedupe: [
      '@embedpdf/angular',
      '@angular/common',
      '@angular/compiler',
      '@angular/core',
      '@angular/platform-browser',
      'rxjs',
    ],
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
