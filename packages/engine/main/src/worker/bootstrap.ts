/**
 * The worker-thread bootstrap, shared by the two worker deliveries:
 *
 *   - `./worker-entry.ts` — shipped as raw TS source (`@embedpdf/engine/worker-entry`),
 *     compiled by the consumer's bundler (Vite `?worker`, manual `new Worker`).
 *   - `workers/pdfium-worker.js` — a self-contained BUILT artifact (Emscripten
 *     glue statically bundled), used two ways: stringified into
 *     `workers/pdfium-worker.source.js` for the default inline-blob spawn, and
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
  /** Absolute URL of `pdfium.wasm`. Omitted = the Emscripten glue resolves it
   *  as a sibling of the worker script (`import.meta.url`). */
  wasmUrl?: string;
  /**
   * CDN safety net, present ONLY when `wasmUrl` is the bundler-resolved
   * default (never for explicit sources). Its presence switches the boot to
   * fetch the bytes itself, so that only a resource-loading failure (network
   * error / non-OK response) can trigger the fallback — errors after
   * bytes-in-hand (compile, instantiate, init) are never retried, because
   * fetching another copy of the same binary would mask them.
   */
  fallbackWasmUrl?: string;
  /** Pre-fetched `pdfium.wasm` bytes (transferred) — wins over `wasmUrl`. */
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
    const source = await resolveBootSource(init);
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
 * Turn the init message into what `createPdfRuntime` receives.
 *
 * A `fallbackWasmUrl` (default source only) moves the fetch into OUR hands:
 * fetch the primary, and only if THE FETCH fails (network error / non-OK
 * response), warn — before any CDN traffic — and fetch the fallback. The
 * winning bytes go to Emscripten as `wasmBinary`; anything that fails after
 * that (compile, instantiate, init) surfaces directly, never retried.
 * Explicit sources (no fallback) keep the streaming `locateFile` path.
 */
async function resolveBootSource(
  init: EngineWorkerInit,
): Promise<{ wasmUrl?: string; wasmBinary?: ArrayBuffer }> {
  if (init.wasmBinary || !init.fallbackWasmUrl || !init.wasmUrl) {
    return { wasmUrl: init.wasmUrl, wasmBinary: init.wasmBinary };
  }
  let primaryFailure: unknown;
  try {
    return { wasmBinary: await fetchWasm(init.wasmUrl) };
  } catch (err) {
    primaryFailure = err;
  }
  console.warn(
    `[embedpdf] pdfium.wasm was not found at ${init.wasmUrl} (${describeError(primaryFailure)}). ` +
      `Falling back to ${init.fallbackWasmUrl}. Your toolchain did not ship the wasm asset with ` +
      `your build — to avoid the CDN request, self-host the file and pass \`wasmUrl\`/\`assetsUrl\` ` +
      `to localEngine(). See https://www.embedpdf.com/docs/self-hosting`,
  );
  try {
    return { wasmBinary: await fetchWasm(init.fallbackWasmUrl) };
  } catch (fallbackFailure) {
    throw new Error(
      `failed to fetch pdfium.wasm from both ${init.wasmUrl} ` +
        `(${describeError(primaryFailure)}) and the fallback ${init.fallbackWasmUrl} ` +
        `(${describeError(fallbackFailure)})`,
    );
  }
}

async function fetchWasm(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.arrayBuffer();
}

function describeError(err: unknown): string {
  return String((err as Error)?.message ?? err);
}

/** Boot failures should teach the fix: the most common one by far is the wasm
 *  fetch failing (offline, air-gapped network, a stale self-hosted path). */
function describeBootError(err: unknown, init: EngineWorkerInit): string {
  const detail = String((err as Error)?.stack ?? err);
  if (init.wasmBinary) return detail;
  const source = init.wasmUrl
    ? `failed to load pdfium.wasm from ${init.wasmUrl}`
    : 'failed to load pdfium.wasm (resolved relative to the worker script)';
  return (
    `${source}. If this URL is unreachable (offline, air-gapped, or blocked), ` +
    `self-host the file and pass \`wasmUrl\`/\`assetsUrl\` to localEngine(), or provide ` +
    `the bytes via \`wasmBinary\`. See https://www.embedpdf.com/docs/self-hosting — ${detail}`
  );
}
