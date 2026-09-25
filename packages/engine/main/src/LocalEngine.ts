import {
  type SessionKind,
  type SignedDocumentPolicy,
  AbortablePromise,
  checkCapability,
  CONTINUOUS_RENDER_POLICY,
  decodePdfBits,
  EngineError,
  EngineErrorCode,
  PermissionDenied,
  wirePack,
  type DocumentHandle,
  type Engine,
  type EngineRenderPolicy,
  type OpenInput,
  type OpenOptions,
} from '@embedpdf/engine-core/runtime';
import { generateUuid } from '@embedpdf/engine-services';

import { LocalDocumentHandle } from './document/LocalDocumentHandle';
import { LocalFontService } from './fonts/LocalFontService';
import { BrowserImageEncoder, type LocalImageEncoder } from './render/BrowserImageEncoder';
import { PortableImageEncoder } from './render/PortableImageEncoder';
import { buildHandleScopeContext, ScopeGuard } from './scope';
import type { Transport } from './transport/Transport';
import { Priority } from './worker/Priority';
import type { JobId, WorkerResultPayload } from './worker/protocol';
import { WorkerQueue } from './worker/WorkerQueue';

export interface LocalEngineOptions {
  transport: Transport;
  concurrency?: number;
  imageEncoder?: LocalImageEncoder;
  /**
   * Deployment render policy for this engine instance — the local
   * counterpart of the lattice a cloud deployment advertises over
   * `/v1/access`, configured the same way permissions are overridden:
   * by the embedder, at construction. Advertised verbatim via
   * `doc.render.getPolicy()`; a lattice's `maxRenderPixels` budget rides
   * into every worker render, and `enforced: true` rejects off-lattice
   * requests exactly like the enforcing server does. Default:
   * `continuous` (render anything).
   */
  renderPolicy?: EngineRenderPolicy;
  /**
   * Whether this engine enforces what a document's signatures forbid
   * (`protect`, the default: a certified document loses page assembly,
   * a locked field refuses writes, a rewrite save is refused) or leaves
   * every edit to the caller (`permit`, for tools that produce or test
   * invalid files). Signature analysis never depends on it.
   */
  signedDocumentPolicy?: SignedDocumentPolicy;
  /**
   * The shape every `open({ kind: 'bytes' })` session takes. Default
   * `layer`: an immutable base with a layer of edits on top, so saves append
   * only what changed and signatures survive later edits. `plain` keeps the
   * classic single in-memory document (a signed file still opens as a
   * layer). See {@link SessionKind}.
   */
  sessionKind?: SessionKind;
}

/**
 * Local engine: speaks the same Engine interface as @cloudpdf/engine
 * but routes everything through a WorkerQueue + Transport (Web Worker or
 * inline) backed by a WASM PDFium runtime.
 */
export class LocalEngine implements Engine {
  static fromTransport(opts: LocalEngineOptions): LocalEngine {
    return new LocalEngine(
      opts.transport,
      opts.concurrency ?? 1,
      opts.imageEncoder,
      opts.renderPolicy,
      opts.signedDocumentPolicy ?? 'protect',
      opts.sessionKind ?? 'layer',
    );
  }

  private readonly queue: WorkerQueue;
  private readonly imageEncoder: LocalImageEncoder;
  private readonly renderPolicy: EngineRenderPolicy;
  /** This engine instance's identity on every event's `origin.sessionId`. */
  private readonly sessionId = `local:${generateUuid()}`;
  private destroyed = false;

  /**
   * Runtime font registration + fallback configuration. Present on the local
   * engine because the developer embedding the viewer controls what fonts ship
   * to the client; the cloud engine deliberately omits it. Typed as the
   * concrete {@link LocalFontService} (which satisfies {@link FontService}) so
   * package-internal collaborators — the boot pipeline's font seeding — can
   * reach its internal surface without casting.
   */
  readonly fonts: LocalFontService;

  private constructor(
    private readonly transport: Transport,
    concurrency: number,
    imageEncoder: LocalImageEncoder | undefined,
    renderPolicy: EngineRenderPolicy | undefined,
    private readonly signedDocumentPolicy: SignedDocumentPolicy,
    private readonly sessionKind: SessionKind,
  ) {
    this.queue = new WorkerQueue(transport, { concurrency });
    // A canvas where there is one; the portable PNG/BMP encoder elsewhere
    // (Node), so an image render works in every environment.
    this.imageEncoder =
      imageEncoder ??
      (typeof document === 'undefined' && typeof OffscreenCanvas === 'undefined'
        ? new PortableImageEncoder()
        : new BrowserImageEncoder());
    this.renderPolicy = renderPolicy ?? CONTINUOUS_RENDER_POLICY;
    this.fonts = new LocalFontService(this.queue);
  }

  /**
   * Start booting the backing transport (Worker spawn + WASM compile) without
   * doing any work. Lazy engines boot on first use anyway; calling this
   * overlaps the boot with app initialization instead of paying for it on the
   * first `open()`. No-op for transports that are live from construction.
   */
  warmup(): void {
    if (this.destroyed) return;
    void this.transport.start?.();
  }

  open(input: OpenInput, options?: OpenOptions): AbortablePromise<DocumentHandle> {
    if (this.destroyed) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.RuntimeUnavailable, 'engine destroyed'),
      );
    }

    // A session without `doc.open` could do nothing: refuse it here, before
    // the file is loaded, as the cloud refuses the token at `/head`.
    // (`pdf.permissions` grants it, and an omitted scope means every one.)
    try {
      if (options?.scope && !checkCapability('doc.open', options.scope, decodePdfBits(null))) {
        return AbortablePromise.rejectReason(new PermissionDenied('doc.open', 'engine-local'));
      }
    } catch (error) {
      return AbortablePromise.rejectReason(error); // an invalid scope string
    }

    if (input.kind === 'bytes') {
      return this.openBytes(input, options);
    }

    if (input.kind === 'layerBytes') {
      return this.openLayerBytes(input, options);
    }

    if (input.kind === 'layerFile') {
      return this.openLayerFile(input, options);
    }

    return AbortablePromise.rejectReason(
      new EngineError(
        EngineErrorCode.InvalidArg,
        `local engine only supports OpenInput.kind === 'bytes', 'layerBytes' or 'layerFile' (got '${input.kind}')`,
      ),
    );
  }

  /** A layer over a base file: PDFium range-reads the base from disk (Node runtimes only). */
  private openLayerFile(
    input: Extract<OpenInput, { kind: 'layerFile' }>,
    options?: OpenOptions,
  ): AbortablePromise<DocumentHandle> {
    const queue = this.queue;
    const password = options?.password ?? null;
    const docId = input.id ?? generateUuid();
    const baseKey = input.baseKey ?? input.basePath;
    const artifactBytes =
      input.layer?.kind === 'artifact' ? toArrayBuffer(input.layer.bytes) : undefined;
    const layer =
      input.layer?.kind === 'artifact-file'
        ? ({ kind: 'artifact-file', path: input.layer.path } as const)
        : artifactBytes === undefined
          ? ({ kind: 'fresh' } as const)
          : ({ kind: 'artifact', bytes: artifactBytes } as const);
    const transfer = artifactBytes ? [artifactBytes] : [];
    const signedDocumentPolicy = this.signedDocumentPolicy;
    const baseSha256 = input.baseSha256;

    const submission = queue.enqueue<WorkerResultPayload>(
      {
        buildPack: (jobId: JobId) =>
          wirePack(
            {
              kind: 'open.layerFileBase',
              jobId,
              docId,
              baseKey,
              basePath: input.basePath,
              layer,
              password,
              signedDocumentPolicy,
              ...(baseSha256 ? { baseSha256 } : {}),
            },
            transfer,
          ),
      },
      { priority: Priority.HIGH },
    );

    return this.openResult(submission, options);
  }

  private openBytes(
    input: Extract<OpenInput, { kind: 'bytes' }>,
    options?: OpenOptions,
  ): AbortablePromise<DocumentHandle> {
    const queue = this.queue;
    const password = options?.password ?? null;
    const buffer = toArrayBuffer(input.bytes);
    const docId = input.id ?? generateUuid();
    const signedDocumentPolicy = this.signedDocumentPolicy;
    const sessionKind = this.sessionKind;

    const submission = queue.enqueue<WorkerResultPayload>(
      {
        // open() is the one current producer that actually carries a buffer.
        // The buffer reference appears once in the payload and once in the
        // transfer manifest — same object, marked for zero-copy move so the
        // sender's `buffer.byteLength` becomes 0 after the transport hands
        // it off to the worker.
        buildPack: (jobId: JobId) =>
          wirePack(
            {
              kind: 'open.fatMem',
              jobId,
              docId,
              bytes: buffer,
              password,
              signedDocumentPolicy,
              sessionKind,
            },
            [buffer],
          ),
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
    const password = options?.password ?? null;
    const docId = input.id ?? generateUuid();
    const baseKey = input.baseKey ?? docId;
    const baseBytes = toArrayBuffer(input.baseBytes);
    const artifactBytes =
      input.layer?.kind === 'artifact' ? toArrayBuffer(input.layer.bytes) : undefined;
    const layer =
      artifactBytes === undefined
        ? ({ kind: 'fresh' } as const)
        : ({ kind: 'artifact', bytes: artifactBytes } as const);
    const transfer = artifactBytes ? [baseBytes, artifactBytes] : [baseBytes];
    const signedDocumentPolicy = this.signedDocumentPolicy;

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
              signedDocumentPolicy,
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
          protection: payload.protection ?? null,
          signedDocumentPolicy: this.signedDocumentPolicy,
        }),
      );
      const handle = new LocalDocumentHandle(
        payload.docId,
        queue,
        imageEncoder,
        payload.security,
        guard,
        this.sessionId,
        this.renderPolicy,
      );
      if (payload.passwordRejected) handle.security.markPasswordRejected();
      return handle;
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
