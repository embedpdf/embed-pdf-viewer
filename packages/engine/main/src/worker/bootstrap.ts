/**
 * The worker-thread bootstrap, shared by the two worker deliveries:
 *
 *   - `./worker-entry.ts` — shipped as raw TS source (`@embedpdf/engine/worker-entry`),
 *     compiled by the consumer's bundler (Vite `?worker`, manual `new Worker`).
 *   - `workers/embedpdf-worker.js` — a self-contained built artifact (Emscripten
 *     glue statically bundled), used two ways: stringified into
 *     `workers/embedpdf-worker.source.js` for the default inline-blob spawn, and
 *     copied verbatim by strict-CSP users as a same-origin static worker.
 *
 * Boot is init-driven: the worker does nothing until the main thread posts
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
  /** Where `embedpdf.wasm`, compiled from `wasmUrl` in a worker of its own,
   *  arrives as `{ module }`: the worker only instantiates it. A null module
   *  (that compile failed), like a `{ kind: 'wasm-module', module: null }`
   *  message from the main thread (that worker never ran), makes the worker
   *  fetch and compile `wasmUrl` itself. */
  wasmPort?: MessagePort;
}

/**
 * Arm the engine worker in the current {@link DedicatedWorkerGlobalScope}:
 * wait for the init message, boot the runtime with the wasm source it
 * carries, then post `{ kind: 'ready' }` (or `{ kind: 'init-error' }`).
 */
export function startEngineWorker(scope: DedicatedWorkerGlobalScope): void {
  let compiled: ((module: WebAssembly.Module | null) => void) | null = null;
  scope.onmessage = (event: MessageEvent) => {
    const data = event.data as
      | EngineWorkerInit
      | { kind: 'wasm-module'; module: null }
      | undefined;
    if (!data || typeof data !== 'object') return;
    if (data.kind === 'wasm-module') {
      compiled?.(null);
      return;
    }
    if (data.kind !== 'init') return;
    let module: Promise<WebAssembly.Module | null> | undefined;
    if (data.wasmPort) {
      const port = data.wasmPort;
      module = new Promise((resolve) => {
        compiled = resolve;
        port.onmessage = (message: MessageEvent<{ module: WebAssembly.Module | null }>) =>
          resolve(message.data?.module ?? null);
      });
      void module.then(() => port.close());
    }
    boot(scope, data, module);
  };
}

function boot(
  scope: DedicatedWorkerGlobalScope,
  init: EngineWorkerInit,
  compiledModule?: Promise<WebAssembly.Module | null>,
): void {
  (async () => {
    const source = resolveBootSource(init);
    const runtime = await createPdfRuntime({
      prefer: 'wasm',
      wasmUrl: source.wasmUrl,
      wasmBinary: source.wasmBinary,
      wasm: compiledModule
        ? instantiateCompiled(compiledModule, init.wasmUrl, (err) =>
            scope.postMessage({ kind: 'init-error', error: describeBootError(err, init) }),
          )
        : undefined,
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

/**
 * Emscripten's `instantiateWasm` hook over a module compiled elsewhere. When
 * none arrives (null), it fetches and compiles `wasmUrl` here, as the glue
 * would: streaming, or from the bytes when the server's MIME type rules that out.
 */
function instantiateCompiled(
  compiled: Promise<WebAssembly.Module | null>,
  wasmUrl: string | undefined,
  onError: (err: unknown) => void,
): Record<string, unknown> {
  return {
    instantiateWasm(
      imports: WebAssembly.Imports,
      receiveInstance: (instance: WebAssembly.Instance, module: WebAssembly.Module) => void,
    ) {
      void compiled
        .then((module) => (module ? module : compileFromUrl(wasmUrl)))
        .then((module) =>
          WebAssembly.instantiate(module, imports).then((instance) =>
            receiveInstance(instance, module),
          ),
        )
        .catch(onError);
      return {};
    },
  };
}

async function compileFromUrl(wasmUrl: string | undefined): Promise<WebAssembly.Module> {
  if (!wasmUrl) throw new Error('no wasm URL to compile from');
  if (typeof WebAssembly.compileStreaming === 'function') {
    try {
      return await WebAssembly.compileStreaming(fetch(wasmUrl, { credentials: 'same-origin' }));
    } catch {
      // A wrong MIME type, for one: compile from the bytes below.
    }
  }
  const response = await fetch(wasmUrl, { credentials: 'same-origin' });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${wasmUrl}`);
  return WebAssembly.compile(await response.arrayBuffer());
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
