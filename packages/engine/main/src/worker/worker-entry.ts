/**
 * Web Worker bootstrap for engine-local.
 *
 * This file is not part of the package's main bundle. Consumers wire it
 * up via Vite's `?worker` import (or a similar bundler primitive). At
 * runtime it:
 *   1. Creates the WASM runtime in this worker thread.
 *   2. Builds a WorkerHost wired to postMessage.
 *   3. Forwards every incoming postMessage to the host.
 *
 * Lives in src/ so consumers can import it as a worker source. It is NOT
 * exported by index.ts.
 */
import type { WirePack, WorkerResponse } from '@embedpdf/engine-core/runtime';
import { WorkerHost } from '@embedpdf/engine-services';
import { createPdfRuntime } from '@embedpdf/engine-runtime';

import type { WorkerRequest } from './protocol';

declare const self: DedicatedWorkerGlobalScope;

(async () => {
  const runtime = await createPdfRuntime({ prefer: 'wasm' });
  // The host hands us a `WirePack<WorkerResponse>` — payload plus the
  // transfer manifest the producing handler declared. We forward both
  // straight to `postMessage`'s second argument so any declared buffers
  // move zero-copy back to the main thread.
  const host = new WorkerHost(runtime, (pack: WirePack<WorkerResponse>) => {
    self.postMessage(pack.payload, pack.transfer as Transferable[]);
  });

  self.onmessage = (event: MessageEvent<WorkerRequest>) => {
    host.receive(event.data);
  };

  self.postMessage({ kind: 'ready' });
})().catch((err) => {
  self.postMessage({ kind: 'init-error', error: String(err?.stack ?? err) });
});

export {};
