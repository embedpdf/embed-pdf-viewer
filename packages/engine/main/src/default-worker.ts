/**
 * The DEFAULT engine worker — a BUILT entry (`dist/default-worker.js`), emitted
 * at the dist root next to `index.js`.
 *
 * `localEngine()` spawns it with the web-standard, bundler-portable pattern:
 *
 * ```ts
 * new Worker(new URL('./default-worker.js', import.meta.url), { type: 'module' })
 * ```
 *
 * Anchoring on `import.meta.url` of the package entry (which always lives at the
 * dist root, regardless of how a downstream bundler splits chunks) is what lets
 * Vite, webpack 5 / Next, Rollup, and Parcel each statically discover and
 * process the worker with ZERO consumer configuration — no `?worker` import, no
 * hand-written worker shim. See `./worker/worker-entry.ts` for the raw-source
 * escape hatch used by custom setups.
 *
 * It must stay a leaf module that only boots the worker (no re-exports), so the
 * `new URL` reference resolves to a self-contained worker script.
 */
import { startEngineWorker } from './worker/bootstrap';

declare const self: DedicatedWorkerGlobalScope;

startEngineWorker(self);

export {};
