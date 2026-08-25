/**
 * Server-side worker_thread entry. Thin Node adapter around the shared
 * WorkerHost from @embedpdf/engine-services. The host owns all
 * open/metadata/close/shutdown dispatch; this file only handles Node
 * concerns: parentPort plumbing, native PDFium runtime creation, the
 * ready/init-error lifecycle messages the WorkerThreadPool waits on, and
 * the process.exit after a successful shutdown so the worker_thread can
 * terminate cleanly.
 */
import { parentPort, workerData } from 'node:worker_threads';

import type { WirePack, WorkerRequest, WorkerResponse } from '@embedpdf/engine-core/runtime';
import { createPdfRuntime } from '@embedpdf/engine-runtime';
import {
  WorkerHost,
  type StartupFontSpec,
  type WorkerImageEncoder,
} from '@embedpdf/engine-services';

import type { WorkerBootstrapData } from './WorkerThreadPool';

if (!parentPort) {
  throw new Error('worker-entry must be loaded as a worker_thread');
}

const port = parentPort;

/**
 * Resolve the deployment fallback fonts handed down in `workerData`. Only
 * paths + metadata cross the thread boundary; PDFium range-reads each file on
 * demand (it is never loaded into the JS heap), mirroring how file-based base
 * documents are opened. A read/load failure throws and surfaces as
 * `init-error`, so a bad font config fails worker spawn rather than degrading
 * silently.
 */
function bootstrapFontSpecs(): StartupFontSpec[] {
  const data = workerData as WorkerBootstrapData | undefined;
  const descriptors = data?.fonts ?? [];
  return descriptors.map((d) => ({
    key: d.key,
    path: d.path,
    familyName: d.familyName,
    weight: d.weight,
    italic: d.italic,
    fallback: d.fallback ?? true,
  }));
}

(async () => {
  const runtime = await createPdfRuntime({ prefer: 'native' });
  // Node's `worker_threads` accepts a `transferList` second argument
  // (typed as `readonly TransferListItem[]`, which is structurally
  // `ArrayBuffer | MessagePort | …`). The host's transfer manifest is
  // typed against the broader DOM `Transferable` union, but the only
  // actual values flowing through today are `ArrayBuffer`s; we cast at
  // the boundary rather than cross-typing the whole engine-core surface
  // to a Node-specific list.
  // WS3 Phase B — the injected encode capability behind the
  // `*.renderEncoded` wire kinds: rasters are compressed HERE, in the
  // worker that produced them, so only compressed kilobytes cross the
  // engine boundary. `encodeToBuffer` copies sharp's output into a
  // fresh Uint8Array — the buffer OWNERSHIP the transfer manifest
  // requires (a pooled Buffer slab view must never be transferred).
  //
  // sharp/libvips loads LAZILY on the first encoded request: with the
  // `CLOUDPDF_ENCODE_IN_ENGINE=0` escape hatch on, no encoded request
  // ever arrives, so the worker never initializes libvips at all — the
  // hatch restores the exact pre-Phase-B worker, not just its routing.
  // Cost: the first encode per worker pays a one-time dynamic import.
  let sharpEncoderPromise: Promise<{
    encodeToBuffer: (
      raster: Parameters<WorkerImageEncoder['encode']>[0],
      opts: Parameters<WorkerImageEncoder['encode']>[1],
    ) => ReturnType<WorkerImageEncoder['encode']>;
  }> | null = null;
  const imageEncoder: WorkerImageEncoder = {
    encode: async (raster, opts) => {
      sharpEncoderPromise ??= import('../render/SharpImageEncoder').then(
        (m) => new m.SharpImageEncoder(),
      );
      return (await sharpEncoderPromise).encodeToBuffer(raster, opts);
    },
  };
  const host = new WorkerHost(
    runtime,
    (pack: WirePack<WorkerResponse>) => {
      port.postMessage(pack.payload, pack.transfer as readonly ArrayBuffer[]);
    },
    { imageEncoder },
  );

  // Seed this thread's runtime fonts before reporting ready, so the first
  // request already has the deployment's fallback fonts available.
  host.registerStartupFonts(bootstrapFontSpecs());

  port.on('message', (msg: WorkerRequest) => {
    host.receive(msg);
    if (msg.kind === 'shutdown') {
      // Allow the resolve message posted by the host to flush before exit.
      setTimeout(() => process.exit(0), 10);
    }
  });

  port.postMessage({ kind: 'ready' });
})().catch((err: unknown) => {
  port.postMessage({ kind: 'init-error', error: String((err as Error)?.stack ?? err) });
});
