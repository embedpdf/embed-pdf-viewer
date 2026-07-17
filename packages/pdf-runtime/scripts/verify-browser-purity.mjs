#!/usr/bin/env node
/**
 * THE CONTRACT: framework apps add zero bundler config for EmbedPDF.
 *
 * Bundles the browser artifacts with vanilla esbuild (`platform: 'browser'`,
 * no externals, no stubs) — the strictest consumer we support (Angular's
 * builder behaves like this). If any Node builtin or node-only dependency
 * (detect-libc, native addons) is reachable from the browser graph, esbuild
 * fails to resolve it and this script fails.
 *
 * Do not "fix" a failure here with stubs or externals — fix the graph: the
 * browser entries (`src/index.browser.ts`, `pdfium.browser.js`) must never
 * import Node-anything. See src/shared.ts for the architecture.
 */
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

const ENTRIES = [
  'dist/index.browser.js', // the package's `default` condition (pulls the wasm32 browser glue)
  'npm/wasm32/lib/pdfium.browser.js', // the glue on its own, for clear attribution
];

let failed = false;
for (const entry of ENTRIES) {
  try {
    await build({
      entryPoints: [root + entry],
      bundle: true,
      write: false,
      platform: 'browser',
      format: 'esm',
      logLevel: 'silent',
      // The wasm binary is an asset reference (new URL), not an import — and
      // esbuild leaves new URL(...) expressions alone, so nothing to allow.
    });
    console.log(`[browser-purity] ok — ${entry}`);
  } catch (err) {
    failed = true;
    console.error(`[browser-purity] FAIL — ${entry} reaches non-browser imports:`);
    for (const e of err.errors ?? []) {
      const loc = e.location ? ` (${e.location.file}:${e.location.line})` : '';
      console.error(`  ${e.text}${loc}`);
    }
  }
}
process.exit(failed ? 1 : 0);
