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
 * (see {@link prebundledWithoutFiles}). There the engine starts as it does where the scripts are
 * on another origin, from blob: URLs.
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
 * The bundled engine worker, or null when no worker can start from it: the scripts are on
 * another origin than the page (the viewer loaded from a CDN, where a browser refuses a worker
 * that isn't the page's own), this build has no `import.meta.url` to resolve it against, or a
 * dev server prebundled the package without the file.
 */
export function findEngineWorkerFile(): string | null {
  if (prebundledWithoutFiles()) return null;
  return startableFile(engineWorkerUrl);
}

/** The bundled image-encoder worker, or null under the same conditions as {@link findEngineWorkerFile}. */
export function findEncoderWorkerFile(): string | null {
  if (prebundledWithoutFiles()) return null;
  return startableFile(() => new URL('../workers/encoder-worker.js?no-inline', import.meta.url));
}

/**
 * Whether a dev server prebundled this package and left its files behind.
 *
 * Vite 7 and older, and so the dev servers of Angular 20 and 21, bundle a package from
 * `node_modules` into a cache folder before serving it. They copy none of its files and leave
 * `new URL('../workers/…', import.meta.url)` as written, so it points beside the cache folder,
 * where nothing is. The same holds for `embedpdf.wasm`, which the build finds the same way.
 * Vite 8 rewrites the expression to the file in `node_modules`, as a bundler does to the file
 * it emits, and a server that serves the package as it is leaves this module where it was.
 *
 * A bundler that emits no files at all (plain esbuild) leaves a production bundle in the same
 * state. It carries no inline copy of the wasm to start from, and is told to use the portable
 * entry (see `loadDevWasm` in `src/wasm-source.ts`).
 */
export function prebundledWithoutFiles(): boolean {
  return movedWithoutFiles(engineWorkerUrl, () => import.meta.url);
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
