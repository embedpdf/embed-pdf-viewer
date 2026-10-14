/**
 * The development warnings in an app's build: an app built for production never warns, one
 * built for development does. Each mode bundles a page that warns once, the way an app's
 * bundler would (it replaces `process.env.NODE_ENV`), and runs it as a browser does: with no `process`.
 *
 * @vitest-environment node
 */
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

import { build, type Rollup } from 'vite';
import { describe, expect, it } from 'vitest';

/** A page that warns once: `src/dev`'s `devWarn`. */
const page = fileURLToPath(new URL('./dev-build/warns.ts', import.meta.url));

/** What the page warns when an app bundles it in `mode` and a browser runs it. */
async function warningsIn(mode: 'production' | 'development'): Promise<unknown[][]> {
  // As `vite build` runs: with `NODE_ENV` the mode's (the test runner's is `test`).
  const testEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = mode;
  let output: Rollup.RollupOutput;
  try {
    output = (await build({
      configFile: false,
      logLevel: 'silent',
      mode,
      build: { write: false, minify: false, rollupOptions: { input: page } },
    })) as Rollup.RollupOutput;
  } finally {
    process.env.NODE_ENV = testEnv;
  }
  const warnings: unknown[][] = [];
  const [chunk] = output.output.filter((file): file is Rollup.OutputChunk => file.type === 'chunk');
  vm.runInNewContext(chunk!.code, {
    console: { warn: (...args: unknown[]) => warnings.push(args) },
  });
  return warnings;
}

describe('development warnings in an app build', () => {
  it('stay out of a production build', async () => {
    expect(await warningsIn('production')).toEqual([]);
  });

  it('show in a development build', async () => {
    expect(await warningsIn('development')).toEqual([['[embedpdf] warned']]);
  });
});
