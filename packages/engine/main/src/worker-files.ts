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
 */
import { allowWorkerUrl } from './trusted-types';

/**
 * The bundled engine worker, or null when no worker can start from it: the scripts are on
 * another origin than the page (the viewer loaded from a CDN, where a browser refuses a worker
 * that isn't the page's own), or this build has no `import.meta.url` to resolve it against.
 */
export function findEngineWorkerFile(): string | null {
  return startableFile(() => new URL('../workers/embedpdf-worker.js', import.meta.url));
}

/** The bundled image-encoder worker, or null under the same conditions as {@link findEngineWorkerFile}. */
export function findEncoderWorkerFile(): string | null {
  return startableFile(() => new URL('../workers/encoder-worker.js?no-inline', import.meta.url));
}

function startableFile(resolve: () => URL): string | null {
  let file: URL;
  try {
    file = resolve();
  } catch {
    return null;
  }
  const pageOrigin = typeof location === 'undefined' ? null : location.origin;
  // An opaque origin ('null': a data: or sandboxed page) is never the same as another one.
  if (pageOrigin === null || pageOrigin === 'null' || file.origin !== pageOrigin) return null;
  allowWorkerUrl(file.href);
  return file.href;
}
