/**
 * BROWSER entry (the exports map's `default` condition). WASM only, ZERO Node
 * imports anywhere in its graph — no `detect-libc`, no `native/`, no builtins.
 * Browsers always resolve to `wasm32`; `prefer` is accepted and ignored so the
 * API matches the node entry exactly.
 *
 * Do not rely on dead-code elimination to keep this pure: bundlers must
 * RESOLVE an import before they can prove its branch unreachable, so a Node
 * import anywhere in this graph breaks strict builders (Angular/esbuild) even
 * if it never executes. Purity is enforced by `verify:browser-purity`.
 */
export * from './shared';

import type { CreatePdfRuntimeOptions, PdfRuntimeModule } from './core/pdf-runtime-module';
import type { RuntimeTarget } from './core/platform';
import { createWasmRuntime } from './wasm/wasm-runtime';

export function resolveRuntimeTarget(): RuntimeTarget | null {
  return 'wasm32';
}

export async function createPdfRuntime(
  opts: CreatePdfRuntimeOptions = {},
): Promise<PdfRuntimeModule> {
  return createWasmRuntime(opts);
}

export const init = createPdfRuntime;
