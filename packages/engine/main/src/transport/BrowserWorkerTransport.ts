import type { WirePack, WorkerRequest, WorkerResponse } from '@embedpdf/engine-core/runtime';

import type { Transport } from './Transport';

interface InitReadyMsg {
  kind: 'ready';
}
interface InitErrorMsg {
  kind: 'init-error';
  error: string;
}

/**
 * Latch a live worker's readiness handshake NOW, before anything else runs.
 *
 * A dedicated worker starts initializing the moment `new Worker()` executes,
 * and its `ready` / `init-error` message is DROPPED if no listener is attached
 * when it fires. Any code that accepts an already-created `Worker` but defers
 * the transport (lazy engine boot) must therefore attach this latch
 * synchronously at accept time, then hand the promise to
 * {@link BrowserWorkerTransport.spawn} — otherwise a worker that finishes
 * booting before the first engine operation would hang the handshake forever.
 */
export function watchWorkerReady(worker: Worker): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const onReady = (e: MessageEvent) => {
      const data = e.data as InitReadyMsg | InitErrorMsg;
      if (!data || typeof data !== 'object' || !('kind' in data)) return;
      if (data.kind === 'ready') {
        worker.removeEventListener('message', onReady);
        resolve();
      } else if (data.kind === 'init-error') {
        worker.removeEventListener('message', onReady);
        reject(new Error(`worker failed to initialize: ${data.error}`));
      }
    };
    worker.addEventListener('message', onReady);
  });
}

/**
 * Browser-only Web Worker transport. The worker is spawned externally and
 * passed in here, which keeps this package independent of any specific
 * bundler primitive (Vite's `?worker`, Webpack 5's `new URL(...)`, etc.).
 *
 * The worker entry is in src/worker/worker-entry.ts and consumers wire it
 * up using their bundler's worker convention.
 */
export class BrowserWorkerTransport implements Transport {
  private readonly listeners = new Set<(msg: WorkerResponse) => void>();
  private readonly onMessageBound: (e: MessageEvent) => void;

  /**
   * Wrap a worker and wait for its init handshake. Pass `ready` when the
   * worker existed before this call (see {@link watchWorkerReady}); omit it
   * only when the worker was created in the same tick, where no handshake
   * message can have fired yet.
   */
  static async spawn(worker: Worker, ready?: Promise<void>): Promise<BrowserWorkerTransport> {
    const transport = new BrowserWorkerTransport(worker);
    await (ready ?? watchWorkerReady(worker));
    return transport;
  }

  private constructor(private readonly worker: Worker) {
    this.onMessageBound = (e: MessageEvent) => this.handleMessage(e);
    worker.addEventListener('message', this.onMessageBound);
  }

  send(pack: WirePack<WorkerRequest>): void {
    // Empty transfer array is a valid no-op for postMessage, so we don't
    // need to branch — the producer's WirePack already encodes the
    // "nothing to transfer" case as `transfer: []`.
    this.worker.postMessage(pack.payload, pack.transfer as Transferable[]);
  }

  onMessage(handler: (msg: WorkerResponse) => void): () => void {
    this.listeners.add(handler);
    return () => {
      this.listeners.delete(handler);
    };
  }

  async terminate(): Promise<void> {
    this.worker.removeEventListener('message', this.onMessageBound);
    this.listeners.clear();
    this.worker.terminate();
  }

  private handleMessage(e: MessageEvent): void {
    const data = e.data as WorkerResponse | InitReadyMsg | InitErrorMsg;
    if (!data || typeof data !== 'object' || !('kind' in data)) return;
    if (data.kind === 'ready' || data.kind === 'init-error') return;
    for (const fn of this.listeners) {
      try {
        fn(data);
      } catch {
        // ignore subscriber errors
      }
    }
  }
}
