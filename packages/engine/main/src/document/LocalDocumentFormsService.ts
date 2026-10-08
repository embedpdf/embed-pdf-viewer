import {
  AbortablePromise,
  EngineError,
  EngineErrorCode,
  deletedFieldOf,
  formResetFacts,
  opIdOf,
  wirePack,
  draftWritesScripts,
  writesScripts,
  type AnnotationActor,
  type FieldPosition,
  type FormCalculationsReorderResult,
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
  type SignatureAppearanceInput,
  type FormWidgetLinkResult,
  type FormWidgetDeleteResult,
  type FormWidgetUpdateResult,
  type FormWidgetsReorderResult,
  type WidgetPatch,
  type AnnotationPosition,
  type AnnotationRef,
  type FormFieldValue,
  type FormResetResult,
  type WidgetPlacement,
  type FormImportResult,
  type FormRepairOptions,
  type FormFieldCreateOptions,
  type FormWidgetAddOptions,
  type WriteOptions,
  type FormRepairResult,
  type FormSetValueResult,
  type FormSnapshot,
  type FormEffect,
  type FormEffectsResult,
} from '@embedpdf/engine-core/runtime';

import type { SessionEventPublisher } from '@embedpdf/engine-services';
import type { ScopeGuard } from '../scope';
import type { JobId, WorkerResultPayload } from '../worker/protocol';
import type { JobQueue } from '../worker/WorkerQueue';

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
    private readonly queue: JobQueue,
    private readonly view: DocClosedView,
    private readonly guard: ScopeGuard,
    private readonly publisher: SessionEventPublisher,
  ) {}

  list(): AbortablePromise<FormSnapshot> {
    const rejected = this.gate('doc.forms.read');
    if (rejected) return rejected;
    const docId = this.docId;
    const submission = this.queue.enqueue<WorkerResultPayload>({
      buildPack: (jobId: JobId) => wirePack({ kind: 'forms.list', effect: 'read', jobId, docId }),
    });
    return this.await(submission, 'forms.list', (payload) => payload.snapshot);
  }

  get(ref: FormFieldRef): AbortablePromise<FormFieldDTO> {
    // Resolved client-side over the snapshot: the worker's form model is
    // version-cached, so this costs one (usually cached) list read.
    return AbortablePromise.run<FormFieldDTO>(async (signal) => {
      const snapshot = await this.forwardAbort(this.list(), signal);
      const field = snapshot.fields.find((f) =>
        ref.kind === 'objectNumber'
          ? f.ref.kind === 'objectNumber' && f.ref.objectNumber === ref.objectNumber
          : f.name === ref.name,
      );
      if (!field) {
        throw new EngineError(
          EngineErrorCode.NotFound,
          ref.kind === 'objectNumber'
            ? `form field not found: object ${ref.objectNumber}`
            : `form field not found: "${ref.name}"`,
        );
      }
      return field;
    });
  }

  setValue(
    ref: FormFieldRef,
    value: FormFieldValue,
    options?: WriteOptions,
  ): AbortablePromise<FormSetValueResult> {
    const write = this.beginWrite('doc.forms.fill', options);
    if (write.rejected) return write.rejected;
    const docId = this.docId;
    const submission = this.queue.enqueue<WorkerResultPayload>({
      buildPack: (jobId: JobId) =>
        wirePack({
          kind: 'forms.setValue',
          effect: 'write',
          jobId,
          opId: write.opId,
          docId,
          ref,
          value,
          ...this.actor(),
        }),
    });
    return this.await(submission, 'forms.setValue', (payload) => {
      this.publisher.publishWrite(write.opId, { type: 'forms.valueSet', ...payload.result });
      return payload.result;
    });
  }

  reset(
    fields?: FormFieldRef | FormFieldRef[],
    options?: WriteOptions,
  ): AbortablePromise<FormResetResult> {
    const write = this.beginWrite('doc.forms.fill', options);
    if (write.rejected) return write.rejected;
    const docId = this.docId;
    const refs = fields === undefined ? undefined : Array.isArray(fields) ? fields : [fields];
    const submission = this.queue.enqueue<WorkerResultPayload>({
      buildPack: (jobId: JobId) =>
        wirePack({ kind: 'forms.reset', effect: 'write', jobId, opId: write.opId, docId, ...(refs ? { refs } : {}) }),
    });
    return this.await(submission, 'forms.reset', (payload) => {
      // One event per field that changed, sharing the write's opId.
      this.publisher.publishWrite(
        write.opId,
        ...formResetFacts(payload.result).map((fact) => ({
          type: 'forms.valueSet' as const,
          ...fact,
        })),
      );
      return payload.result;
    });
  }

  applyEffects(effects: FormEffect[], options?: WriteOptions): AbortablePromise<FormEffectsResult> {
    const write = this.beginWrite('doc.forms.fill', options);
    if (write.rejected) return write.rejected;
    const docId = this.docId;
    const submission = this.queue.enqueue<WorkerResultPayload>({
      buildPack: (jobId: JobId) =>
        wirePack({
          kind: 'forms.applyEffects',
          effect: 'write',
          jobId,
          opId: write.opId,
          docId,
          effects,
          ...this.actor(),
        }),
    });
    return this.await(submission, 'forms.applyEffects', (payload) => {
      if (payload.wrote) {
        this.publisher.publishWrite(write.opId, {
          type: 'forms.effectsApplied',
          ...payload.result,
        });
      }
      return payload.result;
    });
  }

  export(format: FormDataFormat = 'xfdf'): AbortablePromise<FormDataExport> {
    const rejected = this.gate('doc.forms.read');
    if (rejected) return rejected;
    const docId = this.docId;
    const submission = this.queue.enqueue<WorkerResultPayload>({
      buildPack: (jobId: JobId) =>
        wirePack({ kind: 'forms.export', effect: 'snapshot', jobId, docId, format }),
    });
    return this.await(submission, 'forms.export', (payload) => ({
      format: payload.format,
      bytes: new Uint8Array(payload.bytes),
    }));
  }

  import(
    data: Uint8Array | ArrayBuffer,
    format?: FormDataFormat,
    options?: WriteOptions,
  ): AbortablePromise<FormImportResult> {
    const write = this.beginWrite('doc.forms.fill', options);
    if (write.rejected) return write.rejected;
    const docId = this.docId;
    const buffer = toOwnedArrayBuffer(data);
    const submission = this.queue.enqueue<WorkerResultPayload>({
      buildPack: (jobId: JobId) =>
        wirePack(
          {
            kind: 'forms.import',
            effect: 'write',
            jobId,
            opId: write.opId,
            docId,
            data: buffer,
            ...(format ? { format } : {}),
          },
          [buffer],
        ),
    });
    return this.await(submission, 'forms.import', (payload) => {
      this.publisher.publishWrite(write.opId, { type: 'forms.imported', ...payload.result });
      return payload.result;
    });
  }

  create(
    draft: FormFieldDraft,
    options: FormFieldCreateOptions = {},
  ): AbortablePromise<FormFieldCreateResult> {
    const write = this.beginDesign(options, draftWritesScripts(draft));
    if (write.rejected) return write.rejected;
    const docId = this.docId;
    const submission = this.queue.enqueue<WorkerResultPayload>({
      buildPack: (jobId: JobId) =>
        wirePack({
          kind: 'forms.createField',
          effect: 'write',
          jobId,
          opId: write.opId,
          docId,
          draft,
          ...(options.objectNumber !== undefined ? { objectNumber: options.objectNumber } : {}),
          ...(options.widgetObjectNumbers
            ? { widgetObjectNumbers: [...options.widgetObjectNumbers] }
            : {}),
          ...this.actor(),
        }),
    });
    return this.await(submission, 'forms.createField', (payload) => {
      this.publisher.publishWrite(write.opId, { type: 'forms.created', ...payload.result });
      return payload.result;
    });
  }

  setSignatureAppearance(
    ref: FormFieldRef,
    appearance: SignatureAppearanceInput,
    options?: WriteOptions,
  ): AbortablePromise<FormFieldUpdateResult> {
    const write = this.beginWrite('doc.forms.fill', options);
    if (write.rejected) return write.rejected;
    const docId = this.docId;
    const pdf = appearance.pdf.slice().buffer as ArrayBuffer;
    const submission = this.queue.enqueue<WorkerResultPayload>({
      buildPack: (jobId: JobId) =>
        wirePack(
          { kind: 'forms.setSignatureAppearance', effect: 'write', jobId, opId: write.opId, docId, ref, pdf },
          [pdf],
        ),
    });
    return this.await(submission, 'forms.setSignatureAppearance', (payload) => {
      this.publisher.publishWrite(write.opId, { type: 'forms.updated', ...payload.result });
      return payload.result;
    });
  }

  update(
    ref: FormFieldRef,
    patch: FormFieldPatch,
    options?: WriteOptions,
  ): AbortablePromise<FormFieldUpdateResult> {
    const write = this.beginDesign(options, writesScripts(patch.actions));
    if (write.rejected) return write.rejected;
    const docId = this.docId;
    const submission = this.queue.enqueue<WorkerResultPayload>({
      buildPack: (jobId: JobId) =>
        wirePack({ kind: 'forms.updateField', effect: 'write', jobId, opId: write.opId, docId, ref, patch }),
    });
    return this.await(submission, 'forms.updateField', (payload) => {
      this.publisher.publishWrite(write.opId, { type: 'forms.updated', ...payload.result });
      return payload.result;
    });
  }

  delete(ref: FormFieldRef, options?: WriteOptions): AbortablePromise<FormFieldDeleteResult> {
    const write = this.beginWrite('doc.forms.modify', options);
    if (write.rejected) return write.rejected;
    const docId = this.docId;
    const submission = this.queue.enqueue<WorkerResultPayload>({
      buildPack: (jobId: JobId) =>
        wirePack({ kind: 'forms.deleteField', effect: 'write', jobId, opId: write.opId, docId, ref }),
    });
    return this.await(submission, 'forms.deleteField', (payload) => {
      this.publisher.publishWrite(write.opId, {
        type: 'forms.deleted',
        deleted: deletedFieldOf(payload.result),
        ...payload.result,
      });
      return payload.result;
    });
  }

  addWidget(
    ref: FormFieldRef,
    placement: WidgetPlacement,
    options: FormWidgetAddOptions = {},
  ): AbortablePromise<FormWidgetLinkResult> {
    const write = this.beginDesign(options, writesScripts(placement.actions));
    if (write.rejected) return write.rejected;
    const docId = this.docId;
    const submission = this.queue.enqueue<WorkerResultPayload>({
      buildPack: (jobId: JobId) =>
        wirePack({
          kind: 'forms.addWidget',
          effect: 'write',
          jobId,
          opId: write.opId,
          docId,
          ref,
          placement,
          ...(options.objectNumber !== undefined ? { objectNumber: options.objectNumber } : {}),
          ...(options.splitObjectNumber !== undefined
            ? { splitObjectNumber: options.splitObjectNumber }
            : {}),
        }),
    });
    return this.await(submission, 'forms.addWidget', (payload) => {
      this.publisher.publishWrite(write.opId, { type: 'forms.widgetAdded', ...payload.result });
      return payload.result;
    });
  }

  removeWidget(
    ref: FormFieldRef,
    widget: AnnotationRef,
    options?: WriteOptions,
  ): AbortablePromise<FormWidgetLinkResult> {
    const write = this.beginWrite('doc.forms.modify', options);
    if (write.rejected) return write.rejected;
    const docId = this.docId;
    const submission = this.queue.enqueue<WorkerResultPayload>({
      buildPack: (jobId: JobId) =>
        wirePack({ kind: 'forms.detachWidget', effect: 'write', jobId, opId: write.opId, docId, ref, widget }),
    });
    return this.await(submission, 'forms.detachWidget', (payload) => {
      this.publisher.publishWrite(write.opId, { type: 'forms.widgetRemoved', ...payload.result });
      return payload.result;
    });
  }

  deleteWidget(
    widget: AnnotationRef,
    options?: WriteOptions,
  ): AbortablePromise<FormWidgetDeleteResult> {
    const write = this.beginWrite('doc.forms.modify', options);
    if (write.rejected) return write.rejected;
    const docId = this.docId;
    const submission = this.queue.enqueue<WorkerResultPayload>({
      buildPack: (jobId: JobId) =>
        wirePack({
          kind: 'forms.deleteWidget',
          effect: 'write',
          jobId,
          opId: write.opId,
          docId,
          widget,
        }),
    });
    return this.await(submission, 'forms.deleteWidget', (payload) => {
      this.publisher.publishWrite(write.opId, { type: 'forms.widgetDeleted', ...payload.result });
      return payload.result;
    });
  }

  updateWidget(
    widget: AnnotationRef,
    patch: WidgetPatch,
    options?: WriteOptions,
  ): AbortablePromise<FormWidgetUpdateResult> {
    const write = this.beginDesign(options, writesScripts(patch.actions));
    if (write.rejected) return write.rejected;
    const docId = this.docId;
    const submission = this.queue.enqueue<WorkerResultPayload>({
      buildPack: (jobId: JobId) =>
        wirePack({
          kind: 'forms.updateWidget',
          effect: 'write',
          jobId,
          opId: write.opId,
          docId,
          widget,
          patch,
        }),
    });
    return this.await(submission, 'forms.updateWidget', (payload) => {
      this.publisher.publishWrite(write.opId, { type: 'forms.widgetUpdated', ...payload.result });
      return payload.result;
    });
  }

  reorderWidgets(
    widgets: AnnotationRef[],
    position: AnnotationPosition,
    options?: WriteOptions,
  ): AbortablePromise<FormWidgetsReorderResult> {
    const write = this.beginWrite('doc.forms.modify', options);
    if (write.rejected) return write.rejected;
    // The widgets' page: a reorder stays on one page, which the worker checks.
    const page = widgets[0]?.page;
    if (!page) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.InvalidArg, 'a reorder names at least one widget', {
          details: { field: 'widgets' },
        }),
      );
    }
    const docId = this.docId;
    const submission = this.queue.enqueue<WorkerResultPayload>({
      buildPack: (jobId: JobId) =>
        wirePack({
          kind: 'forms.reorderWidgets',
          effect: 'write',
          jobId,
          opId: write.opId,
          docId,
          page,
          widgets,
          position,
        }),
    });
    return this.await(submission, 'forms.reorderWidgets', (payload) => {
      this.publisher.publishWrite(write.opId, {
        type: 'forms.widgetsReordered',
        ...payload.result,
      });
      return payload.result;
    });
  }

  reorderCalculations(
    fields: FormFieldRef[],
    position: FieldPosition,
    options?: WriteOptions,
  ): AbortablePromise<FormCalculationsReorderResult> {
    const write = this.beginWrite('doc.forms.modify', options);
    if (write.rejected) return write.rejected;
    const docId = this.docId;
    const submission = this.queue.enqueue<WorkerResultPayload>({
      buildPack: (jobId: JobId) =>
        wirePack({
          kind: 'forms.reorderCalculations',
          effect: 'write',
          jobId,
          opId: write.opId,
          docId,
          fields,
          position,
        }),
    });
    return this.await(submission, 'forms.reorderCalculations', (payload) => {
      this.publisher.publishWrite(write.opId, {
        type: 'forms.calculationsReordered',
        ...payload.result,
      });
      return payload.result;
    });
  }

  repair(options?: FormRepairOptions): AbortablePromise<FormRepairResult> {
    const write = this.beginWrite('doc.forms.modify', options);
    if (write.rejected) return write.rejected;
    const docId = this.docId;
    const bakeAppearances = options?.bakeAppearances ?? false;
    const submission = this.queue.enqueue<WorkerResultPayload>({
      buildPack: (jobId: JobId) =>
        wirePack({ kind: 'forms.repair', effect: 'write', jobId, opId: write.opId, docId, bakeAppearances }),
    });
    return this.await(submission, 'forms.repair', (payload) => {
      this.publisher.publishWrite(write.opId, { type: 'forms.repaired', ...payload.result });
      return payload.result;
    });
  }

  /**
   * The checks before a write: the document is open, the caller may, and the
   * caller's `opId` is valid. Returns the write's `opId`, or the refusal.
   */
  /** Who the handle's writes act for: stamped as a field's creator or filler. */
  private actor(): { actor?: AnnotationActor } {
    const actor = this.guard.actorForCreate();
    return actor ? { actor } : {};
  }

  /**
   * A design write: `doc.forms.modify`, and `doc.forms.script` too when it
   * writes scripts, submits or links (`scripts`).
   */
  private beginDesign(
    options: WriteOptions | undefined,
    scripts: boolean,
  ): ReturnType<LocalDocumentFormsService['beginWrite']> {
    const write = this.beginWrite('doc.forms.modify', options);
    if (write.rejected || !scripts) return write;
    const rejected = this.gate('doc.forms.script');
    return rejected ? { rejected } : write;
  }

  private beginWrite(
    cap: 'doc.forms.fill' | 'doc.forms.modify',
    options: WriteOptions | undefined,
  ): { opId: string; rejected?: never } | { rejected: AbortablePromise<never> } {
    const rejected = this.gate(cap);
    if (rejected) return { rejected };
    try {
      return { opId: opIdOf(options) };
    } catch (err) {
      return { rejected: AbortablePromise.rejectReason(err) };
    }
  }

  private gate(
    cap: 'doc.forms.read' | 'doc.forms.fill' | 'doc.forms.modify' | 'doc.forms.script',
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
