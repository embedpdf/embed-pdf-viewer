/**
 * The worker-thread bootstrap, shared by the two worker deliveries:
 *
 *   - `./worker-entry.ts` — shipped as raw TS source (`@embedpdf/engine/worker-entry`),
 *     compiled by the consumer's bundler (Vite `?worker`, manual `new Worker`).
 *   - `workers/embedpdf-worker.js` — a self-contained BUILT artifact (Emscripten
 *     glue statically bundled), used two ways: stringified into
 *     `workers/embedpdf-worker.source.js` for the default inline-blob spawn, and
 *     copied verbatim by strict-CSP users as a same-origin static worker.
 *
 * Boot is INIT-DRIVEN: the worker does nothing until the main thread posts
 * `{ kind: 'init', wasmUrl?, wasmBinary? }` (see resolveWasmSource — the main
 * thread decides where the wasm comes from; the worker never guesses). Then it
 * creates the WASM runtime in this thread, wires a {@link WorkerHost} to
 * `postMessage`, and answers with the `ready` / `init-error` handshake that
 * `BrowserWorkerTransport.spawn` waits on.
 *
 * Messages posted before the worker script finishes evaluating are buffered by
 * the platform (a dedicated worker's port is enabled after the initial run),
 * so the main thread may post `init` immediately after `new Worker(...)`.
 */
import type { WirePack, WorkerResponse } from '@embedpdf/engine-core/runtime';
import { WorkerHost } from '@embedpdf/engine-services';
import { createPdfRuntime } from '@embedpdf/engine-runtime';

import type { WorkerRequest } from './protocol';

/** The first message every engine worker expects. */
export interface EngineWorkerInit {
  kind: 'init';
  /** Absolute URL of `embedpdf.wasm`. Omitted = the Emscripten glue resolves it
   *  as a sibling of the worker script (`import.meta.url`). */
  wasmUrl?: string;
  /** Pre-fetched `embedpdf.wasm` bytes (transferred) — wins over `wasmUrl`. */
  wasmBinary?: ArrayBuffer;
}

/**
 * Arm the engine worker in the current {@link DedicatedWorkerGlobalScope}:
 * wait for the init message, boot the runtime with the wasm source it
 * carries, then post `{ kind: 'ready' }` (or `{ kind: 'init-error' }`).
 */
export function startEngineWorker(scope: DedicatedWorkerGlobalScope): void {
  scope.onmessage = (event: MessageEvent) => {
    const data = event.data as EngineWorkerInit | undefined;
    if (!data || typeof data !== 'object' || data.kind !== 'init') return;
    boot(scope, data);
  };
}

function boot(scope: DedicatedWorkerGlobalScope, init: EngineWorkerInit): void {
  (async () => {
    const source = resolveBootSource(init);
    const runtime = await createPdfRuntime({
      prefer: 'wasm',
      wasmUrl: source.wasmUrl,
      wasmBinary: source.wasmBinary,
    });
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
    scope.postMessage({ kind: 'init-error', error: describeBootError(err, init) });
  });
}

/**
 * What `createPdfRuntime` receives: exactly what the main thread decided —
 * a URL (the Emscripten glue fetches and compiles it streaming) or bytes.
 * The worker never fetches on its own and never retries elsewhere: a
 * missing wasm is a build or configuration problem, reported as such.
 */
function resolveBootSource(init: EngineWorkerInit): { wasmUrl?: string; wasmBinary?: ArrayBuffer } {
  return { wasmUrl: init.wasmUrl, wasmBinary: init.wasmBinary };
}

function describeBootError(err: unknown, init: EngineWorkerInit): string {
  const detail = String((err as Error)?.stack ?? err);
  if (init.wasmBinary) return detail;
  const source = init.wasmUrl
    ? `failed to load embedpdf.wasm from ${init.wasmUrl}`
    : 'failed to load embedpdf.wasm (resolved relative to the worker script)';
  return (
    `${source}. Your build did not ship the wasm at that location — either import ` +
    `\`localEngine\` from \`@embedpdf/engine/portable\` (the wasm travels inside your build), ` +
    `or self-host the file and pass \`assetsUrl\`/\`wasmUrl\` to localEngine(), or provide ` +
    `the bytes via \`wasmBinary\`. See https://www.embedpdf.com/docs/viewer/self-hosting — ${detail}`
  );
}
