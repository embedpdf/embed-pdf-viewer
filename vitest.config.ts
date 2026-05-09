import { defineConfig } from 'vitest/config';

/**
 * Workspace-level Vitest entry-point. Per-package configs are the source of
 * truth — this file only glues them together so `vitest` can run from the
 * repo root for fast local iteration. CI uses `turbo run test` (per-package)
 * via `pnpm test`, following Turborepo's recommended `dependsOn: ["^test"]`
 * pattern (with a per-package `@embedpdf/build#test` override that also
 * waits for its own `build` because the regression test shells out a Vite
 * build of a fixture).
 *
 * The browser-mode project is path-filtered in CI; locally, run
 * `pnpm test:browser` from the root.
 */
export default defineConfig({
  test: {
    projects: [
      'packages/models',
      'packages/build',
      'viewers/angular',
      'viewers/angular/vitest.browser.config.ts',
    ],
  },
});
