/**
 * The worker-thread bootstrap, shared by the two worker entrypoints:
 *
 *   - `./worker-entry.ts`  — shipped as raw TS source (`@embedpdf/engine/worker-entry`),
 *     compiled by the consumer's bundler (Vite `?worker`, manual `new Worker`).
 *   - `../default-worker.ts` — a BUILT entry (`dist/default-worker.js`) that
 *     `localEngine()` spawns by default via `new URL(..., import.meta.url)`.
 *
 * Both do the same three things: create the WASM runtime in this thread, wire a
 * {@link WorkerHost} to `postMessage`, and forward every inbound message to it.
 * Keeping it here means the raw and built entries can never drift.
 */
import type { WirePack, WorkerResponse } from '@embedpdf/engine-core/runtime';
import { WorkerHost } from '@embedpdf/engine-services';
import { createPdfRuntime } from '@embedpdf/engine-runtime';

import type { WorkerRequest } from './protocol';

/**
 * Boot the engine worker in the current {@link DedicatedWorkerGlobalScope}.
 * Posts `{ kind: 'ready' }` once the runtime is up (or `{ kind: 'init-error' }`
 * if it failed) — the handshake `BrowserWorkerTransport.spawn` waits on.
 */
export function startEngineWorker(scope: DedicatedWorkerGlobalScope): void {
  (async () => {
    const runtime = await createPdfRuntime({ prefer: 'wasm' });
    // The host hands us a `WirePack<WorkerResponse>` — payload plus the
    // transfer manifest the producing handler declared. We forward both
    // straight to `postMessage`'s second argument so any declared buffers
    // move zero-copy back to the main thread.
    const host = new WorkerHost(runtime, (pack: WirePack<WorkerResponse>) => {
      scope.postMessage(pack.payload, pack.transfer as Transferable[]);
    });

    scope.onmessage = (event: MessageEvent<WorkerRequest>) => {
      host.receive(event.data);
    };

    scope.postMessage({ kind: 'ready' });
  })().catch((err) => {
    scope.postMessage({ kind: 'init-error', error: String(err?.stack ?? err) });
  });
}
