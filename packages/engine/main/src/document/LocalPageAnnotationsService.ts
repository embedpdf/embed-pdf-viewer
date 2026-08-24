import {
  AbortablePromise,
  CONTINUOUS_RENDER_POLICY,
  EngineError,
  EngineErrorCode,
  createPageImageHandle,
  normalizeAnnotationDraft,
  normalizeAnnotationPatch,
  wirePack,
  type EngineRenderPolicy,
  type AnnotationAppearanceImage,
  type AnnotationAppearanceImageOptions,
  type AnnotationAppearanceImagesResult,
  type AnnotationAppearanceRenderOptions,
  type AnnotationAppearancesResult,
  type AnnotationDraft,
  type AnnotationListPageSnapshot,
  type AnnotationPatch,
  type AnnotationRef,
  type AnnotationCreateResult,
  type AnnotationDeleteResult,
  type AnnotationMoveResult,
  type AnnotationUpdateResult,
  type AttachmentContent,
  type CollabTarget,
  type PageAnnotationsService,
  type PageObjectNumber,
} from '@embedpdf/engine-core/runtime';
import type { SessionEventPublisher } from '@embedpdf/engine-services';

import type { LocalImageEncoder } from '../render/BrowserImageEncoder';
import { assertAppearanceOnLattice, withAppearanceBudget } from '../render/renderPolicyGuard';
import type { ScopeGuard } from '../scope';
import { Priority } from '../worker/Priority';
import type { JobId, WorkerResultPayload } from '../worker/protocol';
import type { WorkerQueue } from '../worker/WorkerQueue';

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
 * AFTER the worker confirms — ground truth, never optimistic.
 */
export class LocalPageAnnotationsService implements PageAnnotationsService {
  constructor(
    private readonly docId: string,
    private readonly pageObjectNumber: PageObjectNumber,
    private readonly queue: WorkerQueue,
    private readonly view: DocClosedView,
    private readonly encoder: LocalImageEncoder,
    private readonly guard: ScopeGuard,
    private readonly publisher: SessionEventPublisher,
    private readonly policy: EngineRenderPolicy = CONTINUOUS_RENDER_POLICY,
  ) {}

  list(): AbortablePromise<AnnotationListPageSnapshot> {
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
    const pon = this.pageObjectNumber;
    const submission = this.queue.enqueue<WorkerResultPayload>(
      {
        buildPack: (jobId: JobId) =>
          wirePack({
            kind: 'annotations.listFullPage',
            jobId,
            docId,
            pageObjectNumber: pon,
          }),
      },
      { priority: Priority.MEDIUM },
    );
    return AbortablePromise.run<AnnotationListPageSnapshot>(async (signal) => {
      const onAbort = () => submission.abort(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
      const payload = await submission;
      if (payload.tag !== 'annotations.listFullPage') {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
      }
      return payload.snapshot;
    });
  }

  downloadFile(ref: AnnotationRef): AbortablePromise<AttachmentContent> {
    if (this.view.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document not open: ${this.docId}`),
      );
    }
    // Attachment bytes egress content (a partial download), so like
    // `pages.extract` this gates on `doc.download` — seeing the annotation
    // (`doc.annotate.read`) does not imply extracting its file.
    try {
      this.guard.assertCapability('doc.download');
    } catch (err) {
      return AbortablePromise.rejectReason(err);
    }
    const docId = this.docId;
    const pon = this.pageObjectNumber;
    const submission = this.queue.enqueue<WorkerResultPayload>(
      {
        buildPack: (jobId: JobId) =>
          wirePack({
            kind: 'annotations.readFile',
            jobId,
            docId,
            pageObjectNumber: pon,
            ref,
          }),
      },
      { priority: Priority.MEDIUM },
    );
    return AbortablePromise.run<AttachmentContent>(async (signal) => {
      const onAbort = () => submission.abort(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
      const payload = await submission;
      if (payload.tag !== 'annotations.readFile') {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
      }
      const { content } = payload;
      if (content.bytes === undefined) {
        throw new EngineError(
          EngineErrorCode.WireFormat,
          'annotations.readFile returned no bytes (path mode is server-only)',
        );
      }
      return {
        bytes: new Uint8Array(content.bytes),
        name: content.name,
        ...(content.mimeType !== undefined ? { mimeType: content.mimeType } : {}),
      };
    });
  }

  renderAppearances(
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
    const pon = this.pageObjectNumber;
    const submission = this.queue.enqueue<WorkerResultPayload>(
      {
        buildPack: (jobId: JobId) =>
          wirePack({
            kind: 'annotations.renderAppearances',
            jobId,
            docId,
            pageObjectNumber: pon,
            ...(effectiveOptions ? { options: effectiveOptions } : {}),
          }),
      },
      { priority: Priority.MEDIUM },
    );
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

  renderAppearanceImages(
    options: AnnotationAppearanceImageOptions = {},
  ): AbortablePromise<AnnotationAppearanceImagesResult> {
    return AbortablePromise.run<AnnotationAppearanceImagesResult>(async (signal) => {
      const raw = this.renderAppearances(options);
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

  create(draft: AnnotationDraft): AbortablePromise<AnnotationCreateResult> {
    if (this.view.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document not open: ${this.docId}`),
      );
    }
    // Cloud parity for POST /annotations: creation is gated by an
    // `annotations:create:filter` collab scope (target is the handle's
    // own identity). Under the narrowing model, presence of `modify`
    // also satisfies create when no create-collab is given.
    try {
      const target = this.guard.targetForSelfCreate();
      this.guard.assertCollab('create', target);
    } catch (err) {
      return AbortablePromise.rejectReason(err);
    }
    const actor = this.guard.actorForCreate();

    const docId = this.docId;
    const pon = this.pageObjectNumber;
    return AbortablePromise.run<AnnotationCreateResult>(async (signal) => {
      // Split inline BinarySource fields (stamp images, …) into the wire
      // draft + resource buffers. Async because Blob bytes resolve async;
      // the buffers ride the wirePack transfer list zero-copy.
      const { wire, resources } = await normalizeAnnotationDraft(draft);
      const resourceBuffers = Object.values(resources).map((r) => r.bytes);
      const submission = this.queue.enqueue<WorkerResultPayload>(
        {
          buildPack: (jobId: JobId) =>
            wirePack(
              {
                kind: 'annotations.create',
                jobId,
                docId,
                pageObjectNumber: pon,
                draft: wire,
                ...(resourceBuffers.length > 0 ? { resources } : {}),
                ...(actor ? { actor } : {}),
              },
              resourceBuffers,
            ),
        },
        { priority: Priority.HIGH },
      );
      const onAbort = () => submission.abort(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
      const payload = await submission;
      if (payload.tag !== 'annotations.create') {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
      }
      this.publisher.publishLocal({
        type: 'annotation.created',
        pageObjectNumber: pon,
        ...payload.result,
      });
      return payload.result;
    });
  }

  update(ref: AnnotationRef, patch: AnnotationPatch): AbortablePromise<AnnotationUpdateResult> {
    if (this.view.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document not open: ${this.docId}`),
      );
    }
    return AbortablePromise.run<AnnotationUpdateResult>(async (signal) => {
      // Look up the target row's collab identity before the mutation so
      // the collab check can fire against the existing /EMBD_Metadata.
      // V1 approach: page-fetch + filter — same as the cloud's
      // `LayerService.getAnnotationCollabTarget`. Optimizable to a
      // targeted worker job later.
      const target = await this.collabTargetForRef(ref, signal);
      this.guard.assertCollab('update', target);

      // Group reassignment runs `:set-group` against the caller's
      // default group before building the actor (cloud PATCH parity).
      const patchGroupId = (patch as { groupId?: string }).groupId;
      const isReassigning = typeof patchGroupId === 'string' && patchGroupId !== target.groupId;
      if (isReassigning) {
        this.guard.assertSetGroup(patchGroupId);
      }
      const actor = this.guard.actorForUpdate(target.groupId, patchGroupId);

      const docId = this.docId;
      // Same binary split as create(): wire patch + transferable buffers.
      const { wire, resources } = await normalizeAnnotationPatch(patch);
      const resourceBuffers = Object.values(resources).map((r) => r.bytes);
      const submission = this.queue.enqueue<WorkerResultPayload>(
        {
          buildPack: (jobId: JobId) =>
            wirePack(
              {
                kind: 'annotations.update',
                jobId,
                docId,
                ref,
                patch: wire,
                ...(resourceBuffers.length > 0 ? { resources } : {}),
                ...(actor ? { actor } : {}),
              },
              resourceBuffers,
            ),
        },
        { priority: Priority.HIGH },
      );
      const onAbort = () => submission.abort(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
      const payload = await submission;
      if (payload.tag !== 'annotations.update') {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
      }
      this.publisher.publishLocal({
        type: 'annotation.updated',
        pageObjectNumber: this.pageObjectNumber,
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
    return AbortablePromise.run<AnnotationDeleteResult>(async (signal) => {
      const target = await this.collabTargetForRef(ref, signal);
      this.guard.assertCollab('delete', target);

      const docId = this.docId;
      const submission = this.queue.enqueue<WorkerResultPayload>(
        {
          buildPack: (jobId: JobId) =>
            wirePack({
              kind: 'annotations.delete',
              jobId,
              docId,
              ref,
            }),
        },
        { priority: Priority.HIGH },
      );
      const onAbort = () => submission.abort(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
      const payload = await submission;
      if (payload.tag !== 'annotations.delete') {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
      }
      this.publisher.publishLocal({
        type: 'annotation.deleted',
        pageObjectNumber: this.pageObjectNumber,
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
    const pon = this.pageObjectNumber;
    const submission = this.queue.enqueue<WorkerResultPayload>(
      {
        buildPack: (jobId: JobId) =>
          wirePack({
            kind: 'annotations.move',
            jobId,
            docId,
            pageObjectNumber: pon,
            refs,
            toIndex,
          }),
      },
      { priority: Priority.HIGH },
    );
    return AbortablePromise.run<AnnotationMoveResult>(async (signal) => {
      const onAbort = () => submission.abort(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
      const payload = await submission;
      if (payload.tag !== 'annotations.move') {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
      }
      this.publisher.publishLocal({
        type: 'annotation.moved',
        pageObjectNumber: pon,
        ...payload.result,
      });
      return payload.result;
    });
  }

  /**
   * Resolve the collab subject (userId / groupId) of the target row
   * an UPDATE or DELETE is about to act on. Mirrors the cloud's
   * `LayerService.getAnnotationCollabTarget` — page-fetch + filter
   * over the existing listFullPage worker job. Returns `{}` when the
   * row can't be located; the collab resolver then denies
   * `:self`/`:group=X` filters and the mutator's own InvalidReference
   * surfaces the real error.
   */
  private async collabTargetForRef(ref: AnnotationRef, signal: AbortSignal): Promise<CollabTarget> {
    const submission = this.queue.enqueue<WorkerResultPayload>(
      {
        buildPack: (jobId: JobId) =>
          wirePack({
            kind: 'annotations.listFullPage',
            jobId,
            docId: this.docId,
            pageObjectNumber: ref.pageObjectNumber,
          }),
      },
      { priority: Priority.MEDIUM },
    );
    const onAbort = () => submission.abort(signal.reason);
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });

    const payload = await submission;
    if (payload.tag !== 'annotations.listFullPage') {
      throw new EngineError(
        EngineErrorCode.WireFormat,
        `unexpected payload tag while resolving collab target: ${payload.tag}`,
      );
    }
    const match = payload.snapshot.annotations.find((a) => {
      switch (ref.kind) {
        case 'objectNumber':
          return a.ref.kind === 'objectNumber' && a.ref.annotObjectNumber === ref.annotObjectNumber;
        case 'nm':
          return a.nm === ref.nm;
        case 'index':
          return a.index === ref.index;
      }
    });
    if (!match) return {};
    return {
      ...(match.userId !== undefined ? { userId: match.userId } : {}),
      ...(match.groupId !== undefined ? { groupId: match.groupId } : {}),
    };
  }
}

function copyToExactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const body = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(body).set(bytes);
  return body;
}
