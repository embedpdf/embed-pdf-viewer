import type { WirePack, WorkerRequest, WorkerResponse } from '@embedpdf/engine-core/runtime';
import { WorkerHost } from '@embedpdf/engine-services';
import type { PdfRuntimeModule } from '@embedpdf/engine-runtime';

import type { Transport } from './Transport';

/**
 * Inline transport: runs the WorkerHost in the same JS thread as the queue.
 * Dispatch is asynchronous (queueMicrotask) so callers always observe
 * Promise-style ordering: synchronous code completes before any handler runs.
 *
 * Used by:
 *   - Node demos and conformance tests (no Web Worker available)
 *   - Browser fallback when the user opts out of workers
 *   - Future: server's worker_thread will use a thin shim around this shape
 */
export class InlineTransport implements Transport {
  private readonly host: WorkerHost;
  private readonly listeners = new Set<(msg: WorkerResponse) => void>();
  private destroyed = false;

  constructor(runtime: PdfRuntimeModule) {
    // Inline transport has no thread boundary, so the response pack's
    // `transfer` array is meaningless — we just forward the payload. The
    // host still produces a WirePack for API parity with the worker entries.
    this.host = new WorkerHost(runtime, (pack) => this.deliver(pack.payload));
  }

  send(pack: WirePack<WorkerRequest>): void {
    // No thread boundary => `pack.transfer` is a no-op here. We accept a
    // WirePack for API parity with BrowserWorkerTransport so callers don't
    // have to branch on transport type.
    if (this.destroyed) return;
    queueMicrotask(() => {
      if (this.destroyed) return;
      this.host.receive(pack.payload);
    });
  }

  onMessage(handler: (msg: WorkerResponse) => void): () => void {
    this.listeners.add(handler);
    return () => {
      this.listeners.delete(handler);
    };
  }

  async terminate(): Promise<void> {
    this.destroyed = true;
    this.listeners.clear();
  }

  private deliver(msg: WorkerResponse): void {
    for (const fn of this.listeners) {
      try {
        fn(msg);
      } catch {
        // swallow listener errors
      }
    }
  }
}
