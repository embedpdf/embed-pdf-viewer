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
import { WASM32_VERSION } from './generated/wasm32-version';

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
}

/** The wire shape sent to the worker's init message. */
export interface ResolvedWasmSource {
  wasmUrl?: string;
  /**
   * CDN safety net for the DEFAULT (bundler-resolved) `wasmUrl` — its presence
   * encodes provenance: only the bundler-default source ever carries it, so
   * the worker knows it may retry, and ONLY on a failed fetch (see
   * bootstrap.ts). Explicit sources never fall back: if you self-host and it
   * breaks, silently phoning a CDN would violate the reason you self-hosted.
   */
  fallbackWasmUrl?: string;
  wasmBinary?: ArrayBuffer;
}

export const DEFAULT_WASM_URL = `https://cdn.jsdelivr.net/npm/@embedpdf/engine-runtime-wasm32@${WASM32_VERSION}/lib/embedpdf.wasm`;

/**
 * Resolve the caller's wasm options into what the worker init carries.
 * Explicit sources only — the inline blob worker's bundler-resolved default
 * lives in {@link resolveInlineWasmSource}; every other worker delivery
 * self-resolves the wasm as a sibling of the worker script when no explicit
 * source is given (hence the empty result).
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

/**
 * Resolve the wasm source for the inline blob worker, which cannot
 * self-resolve (a blob URL has no meaningful location). Explicit options win;
 * otherwise the default is SIBLING-FIRST:
 *
 *   1. `@embedpdf/engine-runtime-wasm32/wasm-url` — a static
 *      `new URL('./lib/embedpdf.wasm', import.meta.url)` that bundlers resolve
 *      at build time, shipping the wasm inside the consumer's own build.
 *   2. the version-pinned jsDelivr URL as `fallbackWasmUrl` — used by the
 *      worker only when fetching (1) fails (a toolchain that left the URL
 *      pointing somewhere the wasm is not).
 *
 * The import CANNOT fail under a bundler — an unresolvable specifier is a
 * build-time error there (desired: it fails loudly at build). The catch only
 * covers native-ESM/no-bundler runtimes without the package installed, where
 * the pinned CDN URL becomes the primary source.
 */
export async function resolveInlineWasmSource(
  options: WasmSourceOptions,
): Promise<ResolvedWasmSource> {
  const explicit = resolveWasmSource(options);
  if (explicit.wasmUrl !== undefined || explicit.wasmBinary !== undefined) return explicit;
  try {
    // Bundled artifacts (the snippet, cloud builds) alias this module to a
    // stub exporting undefined — they provide their own explicit source, so a
    // non-string lands on the CDN primary like a missing module would.
    const sibling: unknown = (await import('@embedpdf/engine-runtime-wasm32/wasm-url')).default;
    if (typeof sibling === 'string' && sibling.length > 0) {
      // Not always absolute: webpack's RelativeURL runtime yields a
      // root-relative href like `/_next/static/media/embedpdf.<hash>.wasm`,
      // which a blob: worker cannot resolve (see toAbsoluteUrl).
      return { wasmUrl: toAbsoluteUrl(sibling), fallbackWasmUrl: DEFAULT_WASM_URL };
    }
  } catch {
    // Native-ESM runtime without the package installed — see doc above.
  }
  return { wasmUrl: DEFAULT_WASM_URL };
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
