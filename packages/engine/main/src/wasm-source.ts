/**
 * Where does `embedpdf.wasm` come from?
 *
 * The wasm binary is the ONE runtime-fetched asset of the local engine.
 * Everything else (the worker code) travels through the module graph, so it
 * never needs bundler asset handling — but the 6 MB binary is fetched at
 * runtime from a plain URL, resolved here on the MAIN THREAD (the worker
 * never guesses) in a fixed precedence order:
 *
 *   1. `wasmBinary`  — caller-supplied bytes, zero network (air-gapped).
 *   2. `wasmUrl`     — exact URL.
 *   3. `assetsUrl`   — base directory; `embedpdf.wasm` is appended.
 *   4. the default   — depends on how the worker itself is delivered:
 *      - inline blob worker (the zero-config path): SIBLING-FIRST. The
 *        bundler-resolved URL from `@embedpdf/engine-runtime-wasm32/wasm-url`
 *        (the wasm ships inside the consumer's own build), with the
 *        version-pinned jsDelivr URL as a fetch-failure-only fallback. A blob
 *        worker has no meaningful location, so both URLs are resolved here on
 *        the main thread and must be absolute.
 *      - a real worker URL / caller-built worker: nothing is sent, and the
 *        Emscripten glue resolves `embedpdf.wasm` as a SIBLING of the worker
 *        script (`import.meta.url`). Copying `embedpdf-worker.js` and
 *        `embedpdf.wasm` into one directory is a complete self-host setup, and
 *        bundler-emitted workers (Vite `?worker`) keep their bundler-managed
 *        asset next to the worker chunk.
 */

/**
 * How to deliver a Web Worker:
 * - `'inline'` (default): spawn from a blob URL built from the worker source
 *   string shipped inside this package. Zero configuration in any bundler and
 *   on any CDN; requires `worker-src blob:` under a strict CSP.
 * - a URL string: a same-origin static worker file (strict-CSP setups — copy
 *   it from this package's `workers/` directory).
 * - a `Worker` or `() => Worker`: full control (bundler-native
 *   `new Worker(new URL(...))`, custom worker builds, shared lifecycles).
 */
export type WorkerSource = 'inline' | string | Worker | (() => Worker);

export interface WasmSourceOptions {
  /** Exact URL of `embedpdf.wasm` (absolute, or relative to the page). */
  wasmUrl?: string;
  /** Pre-fetched `embedpdf.wasm` bytes — no network request is made. */
  wasmBinary?: ArrayBuffer | Uint8Array;
  /** Base directory for self-hosted runtime assets; `embedpdf.wasm` is appended. */
  assetsUrl?: string;
  /**
   * The bytes, produced on demand at boot — what `@embedpdf/engine/portable`
   * passes: the binary carried through the module graph as a lazy chunk of
   * the app. Explicit like the three above (it never falls back to anything
   * else), but costs nothing until the engine actually boots.
   */
  wasmLoader?: () => Promise<ArrayBuffer | Uint8Array>;
}

/** The wire shape sent to the worker's init message. */
export interface ResolvedWasmSource {
  wasmUrl?: string;
  wasmBinary?: ArrayBuffer;
}

/**
 * Resolve the caller's wasm options into what the worker init carries.
 * Explicit sources only — the inline blob worker's bundler-resolved default
 * lives in {@link resolveInlineWasmSource}; every other worker delivery
 * self-resolves the wasm as a sibling of the worker script when no explicit
 * source is given (hence the empty result). A `wasmLoader` is explicit too,
 * but asynchronous: see {@link resolveWasmSourceAsync}.
 */
export function resolveWasmSource(options: WasmSourceOptions): ResolvedWasmSource {
  if (options.wasmBinary !== undefined) {
    return { wasmBinary: toStandaloneBuffer(options.wasmBinary) };
  }
  if (options.wasmUrl !== undefined) {
    return { wasmUrl: toAbsoluteUrl(options.wasmUrl) };
  }
  if (options.assetsUrl !== undefined) {
    const base = options.assetsUrl.endsWith('/') ? options.assetsUrl : `${options.assetsUrl}/`;
    return { wasmUrl: toAbsoluteUrl(`${base}embedpdf.wasm`) };
  }
  return {};
}

/** {@link resolveWasmSource} plus the asynchronous explicit source, `wasmLoader`. */
export async function resolveWasmSourceAsync(
  options: WasmSourceOptions,
): Promise<ResolvedWasmSource> {
  const explicit = resolveWasmSource(options);
  if (explicit.wasmUrl !== undefined || explicit.wasmBinary !== undefined) return explicit;
  if (options.wasmLoader) return { wasmBinary: toStandaloneBuffer(await options.wasmLoader()) };
  return {};
}

/**
 * Resolve the wasm source for the inline blob worker, which cannot
 * self-resolve (a blob URL has no meaningful location). Explicit options
 * win; otherwise the default is the SIBLING the consumer's bundler emitted:
 * `@embedpdf/engine-runtime-wasm32/wasm-url`, a static
 * `new URL('./lib/embedpdf.wasm', import.meta.url)` that webpack, Vite,
 * Rspack, Parcel, and Turbopack resolve at build time, shipping the wasm
 * inside the consumer's own build — served from their origin, compiled
 * streaming by the worker.
 *
 * There is deliberately NOTHING after that. A toolchain that cannot carry
 * the asset (Angular's application builder, plain esbuild) fails here with
 * the two fixes named: `@embedpdf/engine/portable`, which carries the wasm
 * through the module graph instead, or `assetsUrl` to a self-hosted copy.
 * No CDN is ever contacted: a request that leaves the app's origin is
 * something the app configures, never something the engine decides.
 */
export async function resolveInlineWasmSource(
  options: WasmSourceOptions,
): Promise<ResolvedWasmSource> {
  const explicit = resolveWasmSource(options);
  if (explicit.wasmUrl !== undefined || explicit.wasmBinary !== undefined) return explicit;
  if (options.wasmLoader) return { wasmBinary: toStandaloneBuffer(await options.wasmLoader()) };
  const sibling = await siblingWasmUrl();
  if (sibling === null) throw new Error(NO_SIBLING_MESSAGE);
  // Not always absolute: webpack's RelativeURL runtime yields a root-relative
  // href like `/_next/static/media/embedpdf.<hash>.wasm`, which a blob:
  // worker cannot resolve (see toAbsoluteUrl).
  return { wasmUrl: toAbsoluteUrl(sibling) };
}

const NO_SIBLING_MESSAGE =
  'embedpdf.wasm has no default location in this build: the bundler-resolved ' +
  '`@embedpdf/engine-runtime-wasm32/wasm-url` module is unavailable. Either import ' +
  '`localEngine` from `@embedpdf/engine/portable` (the wasm travels inside your build as ' +
  'a lazy chunk — works with every bundler), or self-host the file and pass `assetsUrl` / ' +
  '`wasmUrl` / `wasmBinary`. See https://www.embedpdf.com/docs/viewer/self-hosting';

/**
 * The bundler-resolved sibling URL, or null when this build has none. The
 * module cannot fail to RESOLVE under a bundler (that is a build-time error,
 * as it should be); it can fail to EVALUATE — an output format where
 * `import.meta.url` is undefined makes its `new URL()` throw — or export a
 * non-string where a bundled artifact aliased it away. Both mean "no
 * sibling", never "crash the engine".
 */
async function siblingWasmUrl(): Promise<string | null> {
  try {
    const href: unknown = (await import('@embedpdf/engine-runtime-wasm32/wasm-url')).default;
    return typeof href === 'string' && href.length > 0 ? href : null;
  } catch {
    return null;
  }
}

/**
 * Resolve against the page NOW: a relative URL like `/assets/embedpdf.wasm`
 * cannot be resolved inside a `blob:` worker (blob URLs are not hierarchical),
 * so the absolute form must cross the postMessage boundary.
 */
export function toAbsoluteUrl(url: string): string {
  if (typeof document !== 'undefined') return new URL(url, document.baseURI).href;
  if (typeof location !== 'undefined') return new URL(url, location.href).href;
  return url;
}

/**
 * Copy to a standalone ArrayBuffer: the init message TRANSFERS the buffer to
 * the worker, and neutering the caller's copy would break a second engine
 * created from the same options (or a larger buffer the caller still owns).
 */
function toStandaloneBuffer(input: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (input instanceof Uint8Array) {
    const copy = new ArrayBuffer(input.byteLength);
    new Uint8Array(copy).set(input);
    return copy;
  }
  return input.slice(0);
}
