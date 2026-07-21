/**
 * Web Worker bootstrap for engine-local, shipped as raw TS source.
 *
 * This file is not part of the package's main bundle. Consumers wire it up via
 * Vite's `?worker` import (`@embedpdf/engine/worker-entry?worker`) or a similar
 * bundler primitive / manual `new Worker`. Most apps don't need it directly:
 * `localEngine()` spawns the equivalent BUILT worker (`../default-worker.ts`)
 * for them. Reach for this only for a custom worker setup (CSP, a bundler
 * without `new URL` worker support, a shared worker, ...).
 *
 * Lives in src/ so consumers can import it as a worker source. It is NOT
 * exported by index.ts. The actual bootstrap lives in `./bootstrap` so the raw
 * and built entries can never drift.
 */
import { startEngineWorker } from './bootstrap';

declare const self: DedicatedWorkerGlobalScope;

startEngineWorker(self);

export {};
