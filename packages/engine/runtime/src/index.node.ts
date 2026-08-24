/**
 * NODE entry (the exports map's `node` condition). Full auto-detection:
 * native addon for the resolved target, WASM as the universal fallback.
 */
export * from './shared';
export { resolveRuntimeTarget } from './core/platform.node';

import type { CreatePdfRuntimeOptions, PdfRuntimeModule } from './core/pdf-runtime-module';
import { isNodeLike } from './core/platform';
import { resolveRuntimeTarget } from './core/platform.node';
import { createNativeRuntime } from './native/native-runtime';
import { createWasmRuntime } from './wasm/wasm-runtime';

export async function createPdfRuntime(
  opts: CreatePdfRuntimeOptions = {},
): Promise<PdfRuntimeModule> {
  const prefer = opts.prefer ?? 'auto';

  if (prefer === 'wasm' || !isNodeLike()) {
    return createWasmRuntime(opts);
  }

  const target = resolveRuntimeTarget();
  if (target && target !== 'wasm32') {
    try {
      return await createNativeRuntime(target);
    } catch (error) {
      if (prefer === 'native') throw error;
    }
  }

  return createWasmRuntime(opts);
}

export const init = createPdfRuntime;
