import {
  AbortablePromise,
  CONTINUOUS_RENDER_POLICY,
  EngineError,
  EngineErrorCode,
  deletedAnnotationsOf,
  createPageImageHandle,
  hasAnnotationResources,
  resolveAnnotationResources,
  withFileFromResource,
  wirePack,
  type EngineRenderPolicy,
  type AnnotationAppearanceImage,
  type AnnotationAppearanceImageOptions,
  type AnnotationAppearanceImagesResult,
  type AnnotationAppearanceRenderOptions,
  type AnnotationAppearancesResult,
  type AnnotationDraft,
  type AnnotationList,
  type AnnotationPatch,
  type AnnotationRef,
  type AnnotationResourceRole,
  type AnnotationResources,
  type WireAnnotationResources,
  type AnnotationCreateResult,
  type AnnotationDeleteResult,
  type AnnotationFlattenResult,
  type AnnotationMoveResult,
  type FlattenOptions,
  type AnnotationUpdateResult,
  type LocalPageAnnotationsService as LocalPageAnnotationsServiceContract,
  type PageRef,
  checkImageQuality,
} from '@embedpdf/engine-core/runtime';
import type { SessionEventPublisher } from '@embedpdf/engine-services';

import type { LocalImageEncoder } from '../render/BrowserImageEncoder';
import { assertAppearanceOnLattice, withAppearanceBudget } from '../render/renderPolicyGuard';
import type { ScopeGuard } from '../scope';
import type { JobId, WorkerResultPayload } from '../worker/protocol';
import type { JobQueue } from '../worker/WorkerQueue';

interface DocClosedView {
  isClosed(): boolean;
}

/**
 * Page-scoped annotation service. `list()` is the slow path (acquires a
 * pagePtr server-side). Mutation methods are wired to the in-process
 * worker; the worker host runs `AnnotationMutator` synchronously
 * inside the same PDFium runtime instance the read path uses, so create
 * sees its own writes immediately.
 *
 * Every mutation publishes its result to the document's event stream
 * after the worker confirms — ground truth, never optimistic.
 */
export class LocalPageAnnotationsService implements LocalPageAnnotationsServiceContract {
  constructor(
    private readonly docId: string,
    private readonly ref: PageRef,
    private readonly queue: JobQueue,
    private readonly view: DocClosedView,
    private readonly encoder: LocalImageEncoder,
    private readonly guard: ScopeGuard,
    private readonly publisher: SessionEventPublisher,
    private readonly policy: EngineRenderPolicy = CONTINUOUS_RENDER_POLICY,
  ) {}

  list(): AbortablePromise<AnnotationList> {
    if (this.view.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document not open: ${this.docId}`),
      );
    }
    // Reading annotations gates on `doc.annotate.read` — same as the
    // cloud's annotations-read resource.
    try {
      this.guard.assertCapability('doc.annotate.read');
    } catch (err) {
      return AbortablePromise.rejectReason(err);
    }
    const docId = this.docId;
    const ref = this.ref;
    const submission = this.queue.enqueue<WorkerResultPayload>({
      buildPack: (jobId: JobId) =>
        wirePack({ kind: 'annotations.list', effect: 'read', jobId, docId, pages: [ref] }),
    });
    return AbortablePromise.run<AnnotationList>(async (signal) => {
      const onAbort = () => submission.abort(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
      const payload = await submission;
      if (payload.tag !== 'annotations.list') {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
      }
      return payload.list;
    });
  }

  downloadResource(ref: AnnotationRef, role: AnnotationResourceRole): AbortablePromise<Uint8Array> {
    if (this.view.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document not open: ${this.docId}`),
      );
    }
    // A resource egresses content (a partial download), so like
    // `pages.extract` this gates on `doc.download`: seeing the annotation
    // (`doc.annotate.read`) does not imply extracting its bytes.
    try {
      this.guard.assertCapability('doc.download');
    } catch (err) {
      return AbortablePromise.rejectReason(err);
    }
    const docId = this.docId;
    const page = this.ref;
    const kind = role === 'file' ? 'annotations.readFile' : 'annotations.readAppearance';
    const submission = this.queue.enqueue<WorkerResultPayload>({
      buildPack: (jobId: JobId) => wirePack({ kind, effect: 'read', jobId, docId, page, ref }),
    });
    return AbortablePromise.run<Uint8Array>(async (signal) => {
      const onAbort = () => submission.abort(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
      const payload = await submission;
      if (payload.tag === 'annotations.readAppearance') return new Uint8Array(payload.bytes);
      if (payload.tag !== 'annotations.readFile') {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
      }
      if (payload.content.bytes === undefined) {
        throw new EngineError(
          EngineErrorCode.WireFormat,
          'annotations.readFile returned no bytes (path mode is server-only)',
        );
      }
      return new Uint8Array(payload.content.bytes);
    });
  }

  renderAppearancesRaw(
    options?: AnnotationAppearanceRenderOptions,
  ): AbortablePromise<AnnotationAppearancesResult> {
    if (this.view.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document not open: ${this.docId}`),
      );
    }
    // Rendering an appearance reveals the annotation's `/AP` stream, so it
    // gates on the same `doc.annotate.read` capability as `list()` — reading
    // an annotation implies you may see how it draws.
    // The deployment policy applies the same way it does to full pages:
    // appearances are sized by `rect × scale`, so an enforced appearance
    // lattice bounds the scale and the pixel budget rides into the worker.
    try {
      this.guard.assertCapability('doc.annotate.read');
      assertAppearanceOnLattice(this.policy, options);
    } catch (err) {
      return AbortablePromise.rejectReason(err);
    }
    const effectiveOptions = withAppearanceBudget(this.policy, options);
    const docId = this.docId;
    const ref = this.ref;
    const submission = this.queue.enqueue<WorkerResultPayload>({
      buildPack: (jobId: JobId) =>
        wirePack({
          kind: 'annotations.renderAppearances',
          effect: 'read',
          jobId,
          docId,
          page: ref,
          ...(effectiveOptions ? { options: effectiveOptions } : {}),
        }),
    });
    return AbortablePromise.run<AnnotationAppearancesResult>(async (signal) => {
      const onAbort = () => submission.abort(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
      const payload = await submission;
      if (payload.tag !== 'annotations.renderAppearances') {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
      }
      return payload.result;
    });
  }

  renderAppearances(
    options: AnnotationAppearanceImageOptions = {},
  ): AbortablePromise<AnnotationAppearanceImagesResult> {
    return AbortablePromise.run<AnnotationAppearanceImagesResult>(async (signal) => {
      checkImageQuality(options.quality);
      const raw = this.renderAppearancesRaw(options);
      const onAbort = () => raw.abort(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
      const result = await raw;
      if (signal.aborted)
        throw new EngineError(EngineErrorCode.Aborted, 'annotation appearance render aborted');

      // Encode each raster sequentially. `encoder.encode` transfers the
      // raster's backing buffer into a worker, so we never touch
      // `appearance.raster.data` again after this point.
      const appearances: AnnotationAppearanceImage[] = [];
      for (const appearance of result.appearances) {
        if (signal.aborted)
          throw new EngineError(EngineErrorCode.Aborted, 'annotation appearance render aborted');
        const encoded = await this.encoder.encode(appearance.raster, options, signal);
        if (encoded.source.kind !== 'bytes') {
          throw new EngineError(
            EngineErrorCode.WireFormat,
            'local appearance image handle expected a byte source',
          );
        }
        const bytes = encoded.source.bytes;
        const image = createPageImageHandle(encoded, {
          async blob() {
            return new Blob([copyToExactArrayBuffer(bytes)], { type: encoded.contentType });
          },
        });
        appearances.push({
          ref: appearance.ref,
          mode: appearance.mode,
          rect: appearance.rect,
          image,
        });
      }
      return { pageState: result.pageState, appearances };
    });
  }

  create(
    draft: AnnotationDraft,
    resources?: AnnotationResources,
  ): AbortablePromise<AnnotationCreateResult> {
    if (this.view.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document not open: ${this.docId}`),
      );
    }
    // Cloud parity for POST /annotations: creation is gated by an
    // `annotations:create:filter` collab scope (target is the handle's
    // own identity). Under the narrowing model, presence of `modify`
    // also satisfies create when no create-collab is given.
    // A group other than the caller's own takes the same authority as
    // reassigning one (cloud parity).
    const groupId = (draft as { groupId?: string | null }).groupId ?? undefined;
    try {
      if (groupId !== undefined && groupId !== this.guard.identity().groupId) {
        this.guard.assertSetGroup(groupId);
      }
      this.guard.assertCollab('create', this.guard.targetForSelfCreate(groupId));
    } catch (err) {
      return AbortablePromise.rejectReason(err);
    }
    const actor = this.guard.actorForCreate(groupId);
    // A `File` brings its name and type; the bytes travel without them.
    const data = withFileFromResource(draft, resources);

    const docId = this.docId;
    const ref = this.ref;
    return AbortablePromise.run<AnnotationCreateResult>(async (signal) => {
      // Each resource becomes a private copy (async: Blob bytes resolve
      // async). The copy rides the wirePack transfer list and is detached by
      // the worker transport, while the caller's bytes stay intact.
      const wireResources = await resolveAnnotationResources(resources);
      const submission = this.queue.enqueue<WorkerResultPayload>({
        buildPack: (jobId: JobId) =>
          wirePack(
            {
              kind: 'annotations.create',
              effect: 'write',
              jobId,
              docId,
              page: ref,
              draft: data,
              ...(hasAnnotationResources(wireResources) ? { resources: wireResources } : {}),
              ...(actor ? { actor } : {}),
            },
            transferOf(wireResources),
          ),
      });
      const onAbort = () => submission.abort(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
      const payload = await submission;
      if (payload.tag !== 'annotations.create') {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
      }
      this.publisher.publishLocal({
        type: 'annotations.created',
        page: this.ref,
        ...payload.result,
      });
      return payload.result;
    });
  }

  update(
    ref: AnnotationRef,
    patch: AnnotationPatch,
    resources?: AnnotationResources,
  ): AbortablePromise<AnnotationUpdateResult> {
    if (this.view.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document not open: ${this.docId}`),
      );
    }
    // The worker checks the caller's authority against the annotation inside
    // the write (its owner, a group reassignment) and stamps the actor it
    // gives. A signature's protection is the document's, checked here.
    try {
      this.guard.assertAnnotationsUnprotected();
    } catch (err) {
      return AbortablePromise.rejectReason(err);
    }
    const authority = this.guard.annotationAuthority();
    return AbortablePromise.run<AnnotationUpdateResult>(async (signal) => {
      const docId = this.docId;
      // Owned copies, as in create().
      const wireResources = await resolveAnnotationResources(resources);
      const submission = this.queue.enqueue<WorkerResultPayload>({
        buildPack: (jobId: JobId) =>
          wirePack(
            {
              kind: 'annotations.update',
              effect: 'write',
              jobId,
              docId,
              ref,
              patch,
              authority,
              ...(hasAnnotationResources(wireResources) ? { resources: wireResources } : {}),
            },
            transferOf(wireResources),
          ),
      });
      const onAbort = () => submission.abort(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
      const payload = await submission;
      if (payload.tag !== 'annotations.update') {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
      }
      this.publisher.publishLocal({
        type: 'annotations.updated',
        page: this.ref,
        ...payload.result,
      });
      return payload.result;
    });
  }

  delete(ref: AnnotationRef): AbortablePromise<AnnotationDeleteResult> {
    if (this.view.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document not open: ${this.docId}`),
      );
    }
    // The annotation goes with its thread and popups: the worker checks the
    // caller's authority against each of them inside the write. A
    // signature's protection is the document's, checked here.
    try {
      this.guard.assertAnnotationsUnprotected();
    } catch (err) {
      return AbortablePromise.rejectReason(err);
    }
    const authority = this.guard.annotationAuthority();
    return AbortablePromise.run<AnnotationDeleteResult>(async (signal) => {
      const docId = this.docId;
      const submission = this.queue.enqueue<WorkerResultPayload>({
        buildPack: (jobId: JobId) =>
          wirePack({
            kind: 'annotations.delete',
            effect: 'write',
            jobId,
            docId,
            ref,
            authority,
          }),
      });
      const onAbort = () => submission.abort(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
      const payload = await submission;
      if (payload.tag !== 'annotations.delete') {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
      }
      this.publisher.publishLocal({
        type: 'annotations.deleted',
        page: this.ref,
        deleted: deletedAnnotationsOf(payload.result),
        ...payload.result,
      });
      return payload.result;
    });
  }

  move(refs: AnnotationRef[], toIndex: number): AbortablePromise<AnnotationMoveResult> {
    if (this.view.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document not open: ${this.docId}`),
      );
    }
    // Move is a structural reorder — gates on `doc.annotate.modify`,
    // not on per-record collab (no specific target to check). For
    // wildcard / admin tokens, this passes trivially.
    try {
      this.guard.assertCapability('doc.annotate.modify');
    } catch (err) {
      return AbortablePromise.rejectReason(err);
    }
    const docId = this.docId;
    const ref = this.ref;
    const submission = this.queue.enqueue<WorkerResultPayload>({
      buildPack: (jobId: JobId) =>
        wirePack({
          kind: 'annotations.move',
          effect: 'write',
          jobId,
          docId,
          page: ref,
          refs,
          toIndex,
        }),
    });
    return AbortablePromise.run<AnnotationMoveResult>(async (signal) => {
      const onAbort = () => submission.abort(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
      const payload = await submission;
      if (payload.tag !== 'annotations.move') {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
      }
      this.publisher.publishLocal({
        type: 'annotations.moved',
        page: this.ref,
        ...payload.result,
      });
      return payload.result;
    });
  }

  flatten(
    refs: AnnotationRef[],
    options?: FlattenOptions,
  ): AbortablePromise<AnnotationFlattenResult> {
    const usage = options?.usage ?? 'display';
    if (this.view.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document not open: ${this.docId}`),
      );
    }
    // `pages.flatten` for a chosen set: rewrites page content and removes
    // the painted annotations, so it carries the whole-page verb's gates.
    try {
      this.guard.assertCapability('doc.pages.modify');
      this.guard.assertCapability('doc.annotate.modify');
    } catch (err) {
      return AbortablePromise.rejectReason(err);
    }
    const docId = this.docId;
    const ref = this.ref;
    const submission = this.queue.enqueue<WorkerResultPayload>({
      buildPack: (jobId: JobId) =>
        wirePack({
          kind: 'annotations.flatten',
          effect: 'contentWrite',
          jobId,
          docId,
          page: ref,
          refs,
          usage,
        }),
    });
    return AbortablePromise.run<AnnotationFlattenResult>(async (signal) => {
      const onAbort = () => submission.abort(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
      const payload = await submission;
      if (payload.tag !== 'annotations.flatten') {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
      }
      if (payload.wrote) {
        this.publisher.publishLocal({ type: 'annotations.flattened', ...payload.result });
      }
      return payload.result;
    });
  }

  exportAppearance(refs: AnnotationRef[]): AbortablePromise<Uint8Array> {
    if (this.view.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document not open: ${this.docId}`),
      );
    }
    // Egresses content bytes (a partial download) — gated by `doc.download`
    // like `pages.extract`. A read: no event, nothing about the doc changed.
    try {
      this.guard.assertCapability('doc.download');
    } catch (err) {
      return AbortablePromise.rejectReason(err);
    }
    const docId = this.docId;
    const ref = this.ref;
    const submission = this.queue.enqueue<WorkerResultPayload>({
      buildPack: (jobId: JobId) =>
        wirePack({
          kind: 'annotations.exportAppearance',
          effect: 'snapshot',
          jobId,
          docId,
          page: ref,
          refs,
        }),
    });
    return AbortablePromise.run<Uint8Array>(async (signal) => {
      const onAbort = () => submission.abort(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
      const payload = await submission;
      if (payload.tag !== 'annotations.exportAppearance') {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
      }
      return new Uint8Array(payload.bytes);
    });
  }
}

function copyToExactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const body = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(body).set(bytes);
  return body;
}

/** The buffers a write's resources hand to the worker. */
function transferOf(resources: WireAnnotationResources): ArrayBuffer[] {
  return Object.values(resources).filter((bytes): bytes is ArrayBuffer => bytes !== undefined);
}
