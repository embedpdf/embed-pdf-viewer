/**
 * The engine's worker files, `workers/embedpdf-worker.js` and `workers/encoder-worker.js`, at
 * the URLs the consumer's bundler gave them.
 *
 * Each URL is a static `new URL('../workers/…', import.meta.url)`, which webpack 5, Vite, Rspack,
 * Parcel and Turbopack resolve at build time: they copy the file into the app's output (it is
 * self-contained, so a copy is all it needs) and rewrite the expression to its URL. The workers
 * then come from the app's own origin, and `worker-src 'self'` covers them. The relative path is
 * right from `src/` and from `dist/` alike, both one level below the package root, which is why
 * this module sits at the top of `src/`.
 *
 * The encoder worker is smaller than Vite's inline limit, and a worker from a `data:` URL needs
 * `worker-src data:`: `?no-inline` keeps it a file there. Other bundlers keep the query in the URL.
 *
 * One toolchain moves this module and copies nothing: a dev server that prebundles packages
 * (see {@link prebundledDevWasm}). There the engine starts as it does where the scripts are on
 * another origin, from blob: URLs.
 */
import { allowWorkerUrl } from './trusted-types';

/** Where `workers/embedpdf-worker.js` is from this module, as the package lays its files out. */
const ENGINE_WORKER_PATH = '../workers/embedpdf-worker.js';

/**
 * The engine worker's URL in this build: where a bundler put the file, or as written. The path
 * is spelled out again because a bundler only knows the expression with the path written in it.
 */
const engineWorkerUrl = (): URL => new URL('../workers/embedpdf-worker.js', import.meta.url);

/**
 * True once an engine's boot found the package prebundled without its files (see
 * {@link prebundledDevWasm}). A fact about the build, so every engine and encoder shares it.
 */
let leftBehind = false;

/**
 * The bundled engine worker, or null when no worker can start from it: the scripts are on
 * another origin than the page (the viewer loaded from a CDN, where a browser refuses a worker
 * that isn't the page's own), this build has no `import.meta.url` to resolve it against, or a
 * dev server prebundled the package without the file.
 */
export function findEngineWorkerFile(): string | null {
  if (leftBehind) return null;
  return startableFile(engineWorkerUrl);
}

/** The bundled image-encoder worker, or null under the same conditions as {@link findEngineWorkerFile}. */
export function findEncoderWorkerFile(): string | null {
  if (leftBehind) return null;
  return startableFile(() => new URL('../workers/encoder-worker.js?no-inline', import.meta.url));
}

/**
 * The inline wasm for a dev server that prebundled this package and left its files behind, and
 * null in every other build. An engine asks before it starts a worker, which also settles what
 * {@link findEngineWorkerFile} and {@link findEncoderWorkerFile} answer from then on.
 *
 * Vite 7 and older, and so the dev servers of Angular 20 and 21, bundle a package from
 * `node_modules` into a cache folder before serving it. They copy none of its files and leave
 * `new URL('../workers/…', import.meta.url)` as written, so it points beside the cache folder,
 * where nothing is. The same holds for `embedpdf.wasm`, which the build finds the same way.
 * Vite 8 rewrites the expression to the file in `node_modules`, as a bundler does to the file
 * it emits, and a server that serves the package as it is leaves this module where it was.
 *
 * Two things have to hold, because the first proves nothing alone:
 *
 * - The worker URL is still the one written here, and this module has left the package's
 *   folders ({@link movedWithoutFiles}). A production build can look just like that: one that
 *   emits its assets under their own names in `workers/`, beside the folder of its chunks,
 *   puts the worker exactly where the expression points.
 * - The build carries a dev copy of the wasm: `@embedpdf/engine/dev-wasm` is the inline wasm
 *   under the `development` export condition, which a dev server's resolver applies and a
 *   production build's does not. So a production build is never taken for a prebundle, and a
 *   build that is taken for one has the copy to start from.
 */
export async function prebundledDevWasm(): Promise<string | null> {
  const packed = await devWasmWhere(engineWorkerUrl, () => import.meta.url);
  leftBehind = packed !== null;
  return packed;
}

/**
 * The build's dev copy of the wasm where a module at `moduleUrl()` was moved without its files,
 * and null where it wasn't or the build has no copy. Exported for its tests.
 */
export async function devWasmWhere(
  resolve: () => URL,
  moduleUrl: () => string,
): Promise<string | null> {
  if (!movedWithoutFiles(resolve, moduleUrl)) return null;
  try {
    return (await import('@embedpdf/engine/dev-wasm')).default;
  } catch {
    // A build that cannot load the module has no copy either.
    return null;
  }
}

/**
 * True when the worker URL is still the one written in this module, and this module is no
 * longer in the package's `dist/` or `src/`. Exported for its tests.
 */
export function movedWithoutFiles(resolve: () => URL, moduleUrl: () => string): boolean {
  let module: URL;
  let file: URL;
  try {
    module = new URL(moduleUrl());
    file = new URL(String(resolve()), module);
  } catch {
    return false;
  }
  const asWritten = new URL(ENGINE_WORKER_PATH, module);
  const inPackage = /\/(?:dist|src)\/[^/]*$/.test(module.pathname);
  return file.href === asWritten.href && !inPackage;
}

/**
 * The file's absolute URL when a worker can start from it, otherwise null. Exported for its tests.
 *
 * Next.js (webpack and Turbopack) rewrites the expression to a URL relative to the page, whose
 * `origin` is '': it becomes a real URL by resolving its text against the page's own.
 */
export function startableFile(resolve: () => URL): string | null {
  if (typeof location === 'undefined') return null;
  let file: URL;
  try {
    file = new URL(String(resolve()), location.href);
  } catch {
    return null;
  }
  // An opaque origin ('null': a data: or sandboxed page) is never the same as another one.
  if (location.origin === 'null' || file.origin !== location.origin) return null;
  allowWorkerUrl(file.href);
  return file.href;
}
