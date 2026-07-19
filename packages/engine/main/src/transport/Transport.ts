import type { WirePack, WorkerRequest, WorkerResponse } from '@embedpdf/engine-core/runtime';

/**
 * The pluggable boundary between the WorkerQueue (lives on the main thread)
 * and the WorkerHost (which actually runs PDFium). Both real Web Workers and
 * an in-process inline worker satisfy this interface.
 *
 * Note: `send` takes a `WirePack<WorkerRequest>` rather than a bare request
 * plus a side-channel transferables array. This makes "which buffers move
 * across the boundary" a typed property of the message itself, declared at
 * the producer (WorkerQueue.tick → JobSpec.buildPack), not inferred by the
 * transport. Inline transports treat `pack.transfer` as a no-op since there
 * is no thread boundary to cross.
 */
export interface Transport {
  /** Send a request to the host. May be sync or async transport. */
  send(pack: WirePack<WorkerRequest>): void;

  /** Subscribe to responses. Returns an unsubscribe function. */
  onMessage(handler: (msg: WorkerResponse) => void): () => void;

  /** Tear down the transport. */
  terminate(): Promise<void>;
}
