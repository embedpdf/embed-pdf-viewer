/**
 * Web Worker bootstrap for engine-local, shipped as raw TS source AND used as
 * the entry for the built `workers/pdfium-worker.js` artifact (see
 * scripts/build-workers.mjs).
 *
 * Consumers can wire it up via Vite's `?worker` import
 * (`@embedpdf/engine/worker-entry?worker`) or a similar bundler primitive /
 * manual `new Worker`. Most apps don't need it directly: `localEngine()`
 * spawns the equivalent inline worker (the same bundle, stringified) for
 * them. Reach for this only for a custom worker setup (CSP nonces, a shared
 * worker, a custom bundler pipeline, ...).
 *
 * Lives in src/ so consumers can import it as a worker source. It is NOT
 * exported by index.ts. The actual bootstrap lives in `./bootstrap` so the
 * raw, built, and inline deliveries can never drift.
 */
import { startEngineWorker } from './bootstrap';

declare const self: DedicatedWorkerGlobalScope;

startEngineWorker(self);

export {};
