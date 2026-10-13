/**
 * The in-thread transport as a browser gets it: `workers/inline-transport.js`, built from this
 * module by `scripts/build-workers.mjs` with every dependency inlined (the engine host, PDFium's
 * runtime, the schemas and zod), so an app's bundler copies one self-contained file into a lazy
 * chunk and never resolves a package behind it. Its runtime can't find `embedpdf.wasm` by
 * itself (the file has no location a bundler resolved for it), so a runtime given no wasm of
 * its own takes the one the engine resolves, as the worker does.
 *
 * `#inline-transport` names the Node build first, so Node, its test runners and a server build
 * get that one whatever else they ask for. A resolver that asks for `browser` and not `node` in
 * a Node process (Jest's DOM environment) still lands here; this build's runtime refuses to
 * start in Node, so then it loads the Node build instead, by a path no bundler follows.
 */
import { createPdfRuntime, type CreatePdfRuntimeOptions } from '@embedpdf/engine-runtime';

import { InlineTransport } from './InlineTransport';
import type { ResolvedWasmSource } from '../wasm-source';

/**
 * Imports the Node build, `@embedpdf/engine/workers/inline-transport.node.js`, by a path no
 * bundler follows, so a page never loads it. `scripts/build-workers.mjs` defines it at the top
 * of `workers/inline-transport.js`, where the minifier can't drop the bundler annotations.
 */
declare const loadNodeBuild: () => Promise<typeof import('./InlineTransport')>;

/** PDFium in this thread, its wasm from `defaultWasm` when `options` say nothing of it. */
export async function createInlineTransport(
  options: CreatePdfRuntimeOptions = {},
  defaultWasm?: () => Promise<ResolvedWasmSource>,
): Promise<InlineTransport> {
  if (inNode()) return (await loadNodeBuild()).createInlineTransport(options);
  const located =
    hasWasm(options) || !defaultWasm ? options : { ...options, ...(await defaultWasm()) };
  return new InlineTransport(await createPdfRuntime(located));
}

/** Whether the options say where the wasm comes from. */
function hasWasm(options: CreatePdfRuntimeOptions): boolean {
  const module = options.wasm ?? {};
  return (
    options.wasmUrl !== undefined ||
    options.wasmBinary !== undefined ||
    module.locateFile !== undefined ||
    module.wasmBinary !== undefined
  );
}

/** Whether this runs in Node, where the browser build of the runtime won't start (Emscripten's own test). */
function inNode(): boolean {
  return (
    typeof process === 'object' &&
    typeof process.versions?.node === 'string' &&
    (process as { type?: string }).type !== 'renderer'
  );
}
