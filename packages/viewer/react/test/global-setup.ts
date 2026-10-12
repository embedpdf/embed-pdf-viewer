/**
 * Builds the test pages once, before the browser tests run (`test/pages/vite.config.ts`). It
 * needs the npm build of `@embedpdf/viewer` (`pnpm --filter @embedpdf/viewer build`).
 */
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));

export default async function setup(): Promise<void> {
  const viewerDist = resolve(here, '../../main/dist/index.js');
  if (!existsSync(viewerDist)) {
    throw new Error(`The browser tests need the built viewer (${viewerDist}): build it first`);
  }
  // The wrapper's development warnings are part of what the pages check.
  process.env.NODE_ENV = 'development';
  await build({ configFile: join(here, 'pages', 'vite.config.ts') });
}
