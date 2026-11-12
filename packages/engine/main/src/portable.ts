/**
 * `@embedpdf/engine/portable` — the local engine with its wasm delivered
 * through the module graph.
 *
 * The default entry expects the consumer's bundler to emit `embedpdf.wasm`
 * as an asset (`new URL(..., import.meta.url)`), which webpack, Vite, Rspack,
 * Parcel, and Turbopack all do, and which streams and caches like the file it
 * is. Some toolchains cannot — Angular's application builder, plain esbuild.
 * This entry works with all of them: the binary ships as a lazy chunk of the
 * app (`@embedpdf/engine-runtime-wasm32/wasm-inline`, gzipped and base64),
 * fetched from the app's own origin and inflated in the browser. Nothing is
 * requested from anywhere else, ever.
 *
 * Costs, compared with the emitted asset: the same bytes over the wire, a
 * short inflate before boot, and no streaming compile. A separate entry, not
 * a runtime fallback, so a build carries one copy of the binary — this one or
 * the asset, never both.
 *
 * Angular gets this entry without asking: its application builder resolves
 * packages with the `es2020` export condition (the Angular Package Format's
 * own), which no other bundler declares, and `@embedpdf/engine`'s export map
 * routes that condition here. So `import { localEngine } from '@embedpdf/engine'`
 * is the portable engine under Angular and the streamed asset everywhere
 * else — zero configuration in both, decided by the resolver at build time.
 * The bundler matrix (tooling/bundler-matrix) guards the routing.
 *
 * `ng serve` is the exception: its dev server prebundles packages with
 * Vite's resolver, which does not apply `es2020`, so it gets the default
 * entry. From Angular 22 that entry finds its files in `node_modules`. In
 * Angular 20 and 21 it starts as this one does, from a blob: worker and the
 * inline wasm (see `prebundledDevWasm` in `src/worker-files.ts`).
 */
import {
  localEngine as siblingLocalEngine,
  type LocalEngine,
  type LocalEngineRecipeOptions,
} from './index';
import { unpackInlineWasm } from './inline-wasm';

export type { LocalEngine, LocalEngineRecipeOptions };
export * from './index';

/** The wasm bytes from the inline module: lazy import, base64 decode, gunzip. */
export async function loadInlineWasm(): Promise<ArrayBuffer> {
  const { default: packed } = await import('@embedpdf/engine-runtime-wasm32/wasm-inline');
  return unpackInlineWasm(packed);
}

/**
 * `localEngine()` whose default wasm source is {@link loadInlineWasm}, and
 * whose workers start from blob: URLs: a toolchain that needs this entry
 * cannot emit the worker files either.
 */
export function localEngine(options: LocalEngineRecipeOptions = {}): LocalEngine {
  return siblingLocalEngine({ wasmLoader: loadInlineWasm, ...inlineWorkers(), ...options });
}

/** Only where there are workers to start: elsewhere the engine and its encoder run in this thread. */
function inlineWorkers(): Pick<LocalEngineRecipeOptions, 'worker' | 'encoderWorker'> {
  return typeof Worker === 'undefined' ? {} : { worker: 'inline', encoderWorker: 'inline' };
}
