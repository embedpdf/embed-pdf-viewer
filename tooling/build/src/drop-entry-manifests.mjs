#!/usr/bin/env node
/**
 * Runs after ng-packagr, in an Angular package: removes the package.json files it writes inside
 * `dist`, so `dist` in the workspace is what npm installs.
 *
 * ng-packagr writes `dist/package.json` and one per entry point (`dist/search/package.json`) for
 * tools that read `dist` as a package of its own, and its `dist/.npmignore` leaves them out of the
 * published package: the package publishes from its root, whose `exports` point into `dist`. Left
 * in place, TypeScript takes `dist/search/package.json` as the package the declarations belong
 * to, so `dist/search/index.d.ts` can't resolve the package's other entries (`@embedpdf/angular`
 * shows every service without its members).
 *
 *   node ../../../tooling/build/src/drop-entry-manifests.mjs   # in the package, after ng-packagr
 */
import { readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const dist = join(process.cwd(), 'dist');

// ng-packagr writes them at two depths: the package's and one in each entry point's folder.
rmSync(join(dist, 'package.json'), { force: true });
for (const entry of readdirSync(dist, { withFileTypes: true })) {
  if (entry.isDirectory()) rmSync(join(dist, entry.name, 'package.json'), { force: true });
}
