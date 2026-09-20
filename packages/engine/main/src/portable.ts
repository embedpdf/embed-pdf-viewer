/**
 * `@embedpdf/engine/portable` — the local engine with its wasm delivered
 * through the MODULE GRAPH.
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
 * a runtime fallback, so a build carries ONE copy of the binary — this one or
 * the asset, never both.
 *
 * Angular gets this entry WITHOUT asking: its application builder resolves
 * packages with the `es2020` export condition (the Angular Package Format's
 * own), which no other bundler declares, and `@embedpdf/engine`'s export map
 * routes that condition here. So `import { localEngine } from '@embedpdf/engine'`
 * is the portable engine under Angular and the streamed asset everywhere
 * else — zero configuration in both, decided by the resolver at build time.
 * The bundler matrix (tooling/bundler-matrix) guards the routing.
 */
import {
  localEngine as siblingLocalEngine,
  type LocalEngine,
  type LocalEngineRecipeOptions,
} from './index';

export type { LocalEngine, LocalEngineRecipeOptions };
export * from './index';

/** The wasm bytes from the inline module: lazy import, base64 decode, gunzip. */
export async function loadInlineWasm(): Promise<ArrayBuffer> {
  const { default: packed } = await import('@embedpdf/engine-runtime-wasm32/wasm-inline');
  return inflate(decodeBase64(packed));
}

/** `localEngine()` whose default wasm source is {@link loadInlineWasm}. */
export function localEngine(options: LocalEngineRecipeOptions = {}): LocalEngine {
  return siblingLocalEngine({ wasmLoader: loadInlineWasm, ...options });
}

function decodeBase64(text: string): Uint8Array {
  // atob, not a data: URL fetch — a strict `connect-src` can block the latter.
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function inflate(packed: Uint8Array): Promise<ArrayBuffer> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error(
      '[embedpdf] @embedpdf/engine/portable needs DecompressionStream (Chrome 80, Firefox 113, ' +
        'Safari 16.4). Use the default `@embedpdf/engine` entry with a self-hosted wasm instead.',
    );
  }
  const stream = new Blob([packed as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}
