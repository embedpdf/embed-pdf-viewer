import {
  AbortablePromise,
  EngineError,
  EngineErrorCode,
  wirePack,
  type DocumentFormsService,
  type FormDataExport,
  type FormDataFormat,
  type FormFieldCreateResult,
  type FormFieldDeleteResult,
  type FormFieldDraft,
  type FormFieldDTO,
  type FormFieldPatch,
  type FormFieldRef,
  type FormFieldUpdateResult,
  type FormWidgetLinkResult,
  type FormWidgetRef,
  type FormFieldValue,
  type FormImportResult,
  type FormRepairOptions,
  type FormRepairResult,
  type FormSetValueResult,
  type FormSnapshot,
  type FormEffect,
  type FormEffectsResult,
} from '@embedpdf/engine-core/runtime';

import type { SessionEventPublisher } from '@embedpdf/engine-services';
import type { ScopeGuard } from '../scope';
import { Priority } from '../worker/Priority';
import type { JobId, WorkerResultPayload } from '../worker/protocol';
import type { WorkerQueue } from '../worker/WorkerQueue';

interface DocClosedView {
  isClosed(): boolean;
}

/**
 * Document-scoped forms service. Reads gate on `doc.forms.read`, value
 * writes and imports on `doc.forms.fill`, repair on `doc.forms.modify` —
 * cloud parity with the layer form routes. The worker host fans out to
 * `FormReader` / `FormMutator`, which serve every read from the session's
 * version-keyed form-model cache.
 */
export class LocalDocumentFormsService implements DocumentFormsService {
  constructor(
    private readonly docId: string,
    private readonly queue: WorkerQueue,
    private readonly view: DocClosedView,
    private readonly guard: ScopeGuard,
    private readonly publisher: SessionEventPublisher,
  ) {}

  list(): AbortablePromise<FormSnapshot> {
    const rejected = this.gate('doc.forms.read');
    if (rejected) return rejected;
    const docId = this.docId;
    const submission = this.queue.enqueue<WorkerResultPayload>(
      {
        buildPack: (jobId: JobId) => wirePack({ kind: 'forms.list', jobId, docId }),
      },
      { priority: Priority.MEDIUM },
    );
    return this.await(submission, 'forms.list', (payload) => payload.snapshot);
  }

  get(ref: FormFieldRef): AbortablePromise<FormFieldDTO> {
    // Resolved client-side over the snapshot: the worker's form model is
    // version-cached, so this costs one (usually cached) list read.
    return AbortablePromise.run<FormFieldDTO>(async (signal) => {
      const snapshot = await this.forwardAbort(this.list(), signal);
      const field = snapshot.fields.find((f) =>
        ref.kind === 'objectNumber'
          ? f.fieldObjectNumber === ref.fieldObjectNumber
          : f.name === ref.name,
      );
      if (!field) {
        throw new EngineError(
          EngineErrorCode.NotFound,
          ref.kind === 'objectNumber'
            ? `form field not found: object ${ref.fieldObjectNumber}`
            : `form field not found: "${ref.name}"`,
        );
      }
      return field;
    });
  }

  setValue(ref: FormFieldRef, value: FormFieldValue): AbortablePromise<FormSetValueResult> {
    const rejected = this.gate('doc.forms.fill');
    if (rejected) return rejected;
    const docId = this.docId;
    const submission = this.queue.enqueue<WorkerResultPayload>(
      {
        buildPack: (jobId: JobId) => wirePack({ kind: 'forms.setValue', jobId, docId, ref, value }),
      },
      { priority: Priority.HIGH },
    );
    return this.await(submission, 'forms.setValue', (payload) => {
      this.publisher.publishLocal({ type: 'form.valueChanged', ...payload.result });
      return payload.result;
    });
  }

  reset(ref: FormFieldRef): AbortablePromise<FormSetValueResult> {
    const rejected = this.gate('doc.forms.fill');
    if (rejected) return rejected;
    const docId = this.docId;
    const submission = this.queue.enqueue<WorkerResultPayload>(
      {
        buildPack: (jobId: JobId) => wirePack({ kind: 'forms.reset', jobId, docId, ref }),
      },
      { priority: Priority.HIGH },
    );
    return this.await(submission, 'forms.reset', (payload) => {
      this.publisher.publishLocal({ type: 'form.valueChanged', ...payload.result });
      return payload.result;
    });
  }

  applyEffects(effects: FormEffect[]): AbortablePromise<FormEffectsResult> {
    const rejected = this.gate('doc.forms.fill');
    if (rejected) return rejected;
    const docId = this.docId;
    const submission = this.queue.enqueue<WorkerResultPayload>(
      {
        buildPack: (jobId: JobId) =>
          wirePack({ kind: 'forms.applyEffects', jobId, docId, effects }),
      },
      { priority: Priority.HIGH },
    );
    return this.await(submission, 'forms.applyEffects', (payload) => {
      if (payload.result.meta !== null) {
        this.publisher.publishLocal({ type: 'form.effectsApplied', ...payload.result });
      }
      return payload.result;
    });
  }

  exportData(format: FormDataFormat = 'xfdf'): AbortablePromise<FormDataExport> {
    const rejected = this.gate('doc.forms.read');
    if (rejected) return rejected;
    const docId = this.docId;
    const submission = this.queue.enqueue<WorkerResultPayload>(
      {
        buildPack: (jobId: JobId) => wirePack({ kind: 'forms.export', jobId, docId, format }),
      },
      { priority: Priority.MEDIUM },
    );
    return this.await(submission, 'forms.export', (payload) => ({
      format: payload.format,
      bytes: new Uint8Array(payload.bytes),
    }));
  }

  importData(
    data: Uint8Array | ArrayBuffer,
    format?: FormDataFormat,
  ): AbortablePromise<FormImportResult> {
    const rejected = this.gate('doc.forms.fill');
    if (rejected) return rejected;
    const docId = this.docId;
    const buffer = toOwnedArrayBuffer(data);
    const submission = this.queue.enqueue<WorkerResultPayload>(
      {
        buildPack: (jobId: JobId) =>
          wirePack(
            { kind: 'forms.import', jobId, docId, data: buffer, ...(format ? { format } : {}) },
            [buffer],
          ),
      },
      { priority: Priority.HIGH },
    );
    return this.await(submission, 'forms.import', (payload) => {
      this.publisher.publishLocal({ type: 'form.imported', ...payload.result });
      return payload.result;
    });
  }

  createField(draft: FormFieldDraft): AbortablePromise<FormFieldCreateResult> {
    const rejected = this.gate('doc.forms.modify');
    if (rejected) return rejected;
    const docId = this.docId;
    const submission = this.queue.enqueue<WorkerResultPayload>(
      {
        buildPack: (jobId: JobId) => wirePack({ kind: 'forms.createField', jobId, docId, draft }),
      },
      { priority: Priority.HIGH },
    );
    return this.await(submission, 'forms.createField', (payload) => {
      this.publisher.publishLocal({ type: 'form.fieldCreated', ...payload.result });
      return payload.result;
    });
  }

  updateField(ref: FormFieldRef, patch: FormFieldPatch): AbortablePromise<FormFieldUpdateResult> {
    const rejected = this.gate('doc.forms.modify');
    if (rejected) return rejected;
    const docId = this.docId;
    const submission = this.queue.enqueue<WorkerResultPayload>(
      {
        buildPack: (jobId: JobId) =>
          wirePack({ kind: 'forms.updateField', jobId, docId, ref, patch }),
      },
      { priority: Priority.HIGH },
    );
    return this.await(submission, 'forms.updateField', (payload) => {
      this.publisher.publishLocal({ type: 'form.fieldUpdated', ...payload.result });
      return payload.result;
    });
  }

  deleteField(ref: FormFieldRef): AbortablePromise<FormFieldDeleteResult> {
    const rejected = this.gate('doc.forms.modify');
    if (rejected) return rejected;
    const docId = this.docId;
    const submission = this.queue.enqueue<WorkerResultPayload>(
      {
        buildPack: (jobId: JobId) => wirePack({ kind: 'forms.deleteField', jobId, docId, ref }),
      },
      { priority: Priority.HIGH },
    );
    return this.await(submission, 'forms.deleteField', (payload) => {
      this.publisher.publishLocal({ type: 'form.fieldDeleted', ...payload.result });
      return payload.result;
    });
  }

  attachWidget(
    ref: FormFieldRef,
    widget: FormWidgetRef,
    options?: { onState?: string },
  ): AbortablePromise<FormWidgetLinkResult> {
    const rejected = this.gate('doc.forms.modify');
    if (rejected) return rejected;
    const docId = this.docId;
    const onState = options?.onState;
    const submission = this.queue.enqueue<WorkerResultPayload>(
      {
        buildPack: (jobId: JobId) =>
          wirePack({
            kind: 'forms.attachWidget',
            jobId,
            docId,
            ref,
            widget,
            ...(onState ? { onState } : {}),
          }),
      },
      { priority: Priority.HIGH },
    );
    return this.await(submission, 'forms.attachWidget', (payload) => {
      this.publisher.publishLocal({ type: 'form.widgetAttached', ...payload.result });
      return payload.result;
    });
  }

  detachWidget(ref: FormFieldRef, widget: FormWidgetRef): AbortablePromise<FormWidgetLinkResult> {
    const rejected = this.gate('doc.forms.modify');
    if (rejected) return rejected;
    const docId = this.docId;
    const submission = this.queue.enqueue<WorkerResultPayload>(
      {
        buildPack: (jobId: JobId) =>
          wirePack({ kind: 'forms.detachWidget', jobId, docId, ref, widget }),
      },
      { priority: Priority.HIGH },
    );
    return this.await(submission, 'forms.detachWidget', (payload) => {
      this.publisher.publishLocal({ type: 'form.widgetDetached', ...payload.result });
      return payload.result;
    });
  }

  repair(options?: FormRepairOptions): AbortablePromise<FormRepairResult> {
    const rejected = this.gate('doc.forms.modify');
    if (rejected) return rejected;
    const docId = this.docId;
    const bakeAppearances = options?.bakeAppearances ?? false;
    const submission = this.queue.enqueue<WorkerResultPayload>(
      {
        buildPack: (jobId: JobId) =>
          wirePack({ kind: 'forms.repair', jobId, docId, bakeAppearances }),
      },
      { priority: Priority.HIGH },
    );
    return this.await(submission, 'forms.repair', (payload) => {
      this.publisher.publishLocal({ type: 'form.repaired', ...payload.result });
      return payload.result;
    });
  }

  private gate(
    cap: 'doc.forms.read' | 'doc.forms.fill' | 'doc.forms.modify',
  ): AbortablePromise<never> | null {
    if (this.view.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document not open: ${this.docId}`),
      );
    }
    try {
      this.guard.assertCapability(cap);
    } catch (err) {
      return AbortablePromise.rejectReason(err);
    }
    return null;
  }

  private await<Tag extends WorkerResultPayload['tag'], R>(
    submission: AbortablePromise<WorkerResultPayload>,
    tag: Tag,
    map: (payload: Extract<WorkerResultPayload, { tag: Tag }>) => R,
  ): AbortablePromise<R> {
    return AbortablePromise.run<R>(async (signal) => {
      const payload = await this.forwardAbort(submission, signal);
      if (payload.tag !== tag) {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
      }
      return map(payload as Extract<WorkerResultPayload, { tag: Tag }>);
    });
  }

  private forwardAbort<T>(promise: AbortablePromise<T>, signal: AbortSignal): AbortablePromise<T> {
    const onAbort = () => promise.abort(signal.reason);
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
    return promise;
  }
}

function toOwnedArrayBuffer(data: Uint8Array | ArrayBuffer): ArrayBuffer {
  if (data instanceof ArrayBuffer) {
    // Copy: the buffer is transferred to the worker and would otherwise be
    // detached under the caller's feet.
    return data.slice(0);
  }
  const copy = new ArrayBuffer(data.byteLength);
  new Uint8Array(copy).set(data);
  return copy;
}
