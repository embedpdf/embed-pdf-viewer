#!/usr/bin/env node
/**
 * Runs after ng-packagr: removes the package.json files it writes inside `dist`, so `dist` in the
 * workspace is what npm installs.
 *
 * ng-packagr writes `dist/package.json` and one per entry point (`dist/search/package.json`) for
 * tools that read `dist` as a package of its own, and its `dist/.npmignore` leaves them out of the
 * published package: this package publishes from its root, whose `exports` point into `dist`.
 * Left in place, TypeScript takes `dist/search/package.json` as the package the declarations
 * belong to, so `dist/search/index.d.ts` can't resolve `@embedpdf/angular/runtime`, and an app in
 * this workspace sees every service without its members.
 */
import { readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist', import.meta.url));

// ng-packagr writes them at two depths: the package's and one in each entry point's folder.
rmSync(join(dist, 'package.json'), { force: true });
for (const entry of readdirSync(dist, { withFileTypes: true })) {
  if (entry.isDirectory()) rmSync(join(dist, entry.name, 'package.json'), { force: true });
}
