import {
  AbortablePromise,
  EngineError,
  EngineErrorCode,
  wirePack,
  type DocumentHandle,
  type Engine,
  type FontService,
  type OpenInput,
  type OpenOptions,
} from '@embedpdf/engine-core/runtime';
import { generateUuid } from '@embedpdf/engine-services';

import { LocalDocumentHandle } from './document/LocalDocumentHandle';
import { LocalFontService } from './fonts/LocalFontService';
import { BrowserImageEncoder, type LocalImageEncoder } from './render/BrowserImageEncoder';
import { buildHandleScopeContext, ScopeGuard } from './scope';
import type { Transport } from './transport/Transport';
import { Priority } from './worker/Priority';
import type { JobId, WorkerResultPayload } from './worker/protocol';
import { WorkerQueue } from './worker/WorkerQueue';

export interface LocalEngineOptions {
  transport: Transport;
  concurrency?: number;
  imageEncoder?: LocalImageEncoder;
}

/**
 * Local engine: speaks the same Engine interface as @cloudpdf/engine
 * but routes everything through a WorkerQueue + Transport (Web Worker or
 * inline) backed by a WASM PDFium runtime.
 */
export class LocalEngine implements Engine {
  static fromTransport(opts: LocalEngineOptions): LocalEngine {
    return new LocalEngine(opts.transport, opts.concurrency ?? 1, opts.imageEncoder);
  }

  private readonly queue: WorkerQueue;
  private readonly imageEncoder: LocalImageEncoder;
  /** This engine instance's identity on every event's `origin.sessionId`. */
  private readonly sessionId = `local:${generateUuid()}`;
  private destroyed = false;

  /**
   * Runtime font registration + fallback configuration. Present on the local
   * engine because the developer embedding the viewer controls what fonts ship
   * to the client; the cloud engine deliberately omits it.
   */
  readonly fonts: FontService;

  private constructor(
    transport: Transport,
    concurrency: number,
    imageEncoder: LocalImageEncoder | undefined,
  ) {
    this.queue = new WorkerQueue(transport, { concurrency });
    this.imageEncoder = imageEncoder ?? new BrowserImageEncoder();
    this.fonts = new LocalFontService(this.queue);
  }

  open(input: OpenInput, options?: OpenOptions): AbortablePromise<DocumentHandle> {
    if (this.destroyed) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.RuntimeUnavailable, 'engine destroyed'),
      );
    }

    if (input.kind === 'bytes') {
      return this.openBytes(input, options);
    }

    if (input.kind === 'layerBytes') {
      return this.openLayerBytes(input, options);
    }

    return AbortablePromise.rejectReason(
      new EngineError(
        EngineErrorCode.InvalidArg,
        `local engine only supports OpenInput.kind === 'bytes' or 'layerBytes' (got '${input.kind}')`,
      ),
    );
  }

  private openBytes(
    input: Extract<OpenInput, { kind: 'bytes' }>,
    options?: OpenOptions,
  ): AbortablePromise<DocumentHandle> {
    const queue = this.queue;
    const password = options?.password ?? input.password ?? null;
    const buffer = toArrayBuffer(input.bytes);
    const docId = input.id;

    const submission = queue.enqueue<WorkerResultPayload>(
      {
        // open() is the one current producer that actually carries a buffer.
        // The buffer reference appears once in the payload and once in the
        // transfer manifest — same object, marked for zero-copy move so the
        // sender's `buffer.byteLength` becomes 0 after the transport hands
        // it off to the worker.
        buildPack: (jobId: JobId) =>
          wirePack({ kind: 'open.fatMem', jobId, docId, bytes: buffer, password }, [buffer]),
      },
      { priority: Priority.HIGH },
    );

    return this.openResult(submission, options);
  }

  private openLayerBytes(
    input: Extract<OpenInput, { kind: 'layerBytes' }>,
    options?: OpenOptions,
  ): AbortablePromise<DocumentHandle> {
    const queue = this.queue;
    const password = options?.password ?? input.password ?? null;
    const docId = input.id;
    const baseKey = input.baseKey ?? input.id;
    const baseBytes = toArrayBuffer(input.baseBytes);
    const artifactBytes =
      input.layer?.kind === 'artifact' ? toArrayBuffer(input.layer.bytes) : undefined;
    const layer =
      artifactBytes === undefined
        ? ({ kind: 'fresh' } as const)
        : ({ kind: 'artifact', bytes: artifactBytes } as const);
    const transfer = artifactBytes ? [baseBytes, artifactBytes] : [baseBytes];

    const submission = queue.enqueue<WorkerResultPayload>(
      {
        buildPack: (jobId: JobId) =>
          wirePack(
            {
              kind: 'open.layerMemBase',
              jobId,
              docId,
              baseKey,
              baseBytes,
              layer,
              password,
            },
            transfer,
          ),
      },
      { priority: Priority.HIGH },
    );

    return this.openResult(submission, options);
  }

  private openResult(
    submission: AbortablePromise<WorkerResultPayload>,
    options?: OpenOptions,
  ): AbortablePromise<DocumentHandle> {
    const queue = this.queue;
    const imageEncoder = this.imageEncoder;
    return AbortablePromise.run<DocumentHandle>(async (signal) => {
      const onAbort = () => submission.abort(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });

      const payload = await submission;
      if (payload.tag !== 'open') {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
      }
      // Build the scope/identity/PDF-bits context for this handle. The
      // PDF bits come straight from the open response's security probe
      // (FPDF_GetDocPermissions decoded on the worker), so no extra
      // round-trip is needed.
      const guard = new ScopeGuard(
        buildHandleScopeContext({
          scope: options?.scope,
          identity: options?.identity,
          pdfPermissionsBits: payload.security.pdfPermissionsBits,
        }),
      );
      return new LocalDocumentHandle(
        payload.docId,
        queue,
        imageEncoder,
        payload.security,
        guard,
        this.sessionId,
      );
    });
  }

  destroy(): AbortablePromise<void> {
    if (this.destroyed) {
      return AbortablePromise.resolveValue<void>(undefined);
    }
    this.destroyed = true;
    return AbortablePromise.run<void>(async () => {
      await this.queue.shutdown();
      this.imageEncoder.destroy?.();
    });
  }
}

function toArrayBuffer(input: Uint8Array | ArrayBuffer): ArrayBuffer {
  if (input instanceof ArrayBuffer) return input;
  // Copy to a fresh ArrayBuffer so we can transfer it without disturbing
  // an unrelated SharedArrayBuffer or larger view the caller still owns.
  const copy = new ArrayBuffer(input.byteLength);
  new Uint8Array(copy).set(input);
  return copy;
}
