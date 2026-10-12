/**
 * Builds the test pages once, before the browser tests run (`test/pages/vite.config.ts`). They
 * need the npm build of `@embedpdf/viewer` (`pnpm --filter @embedpdf/viewer build`) and this
 * package's own (`pnpm build`), which they import as an app installed from npm does.
 */
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));

export default async function setup(): Promise<void> {
  for (const dist of [
    resolve(here, '../../main/dist/index.js'),
    resolve(here, '../dist/fesm2022/embedpdf-viewer-angular.mjs'),
  ]) {
    if (!existsSync(dist)) {
      throw new Error(`The browser tests need ${dist}: build it first`);
    }
  }
  // The wrapper's development warnings are part of what the pages check.
  process.env.NODE_ENV = 'development';
  await build({ configFile: join(here, 'pages', 'vite.config.ts') });
}
