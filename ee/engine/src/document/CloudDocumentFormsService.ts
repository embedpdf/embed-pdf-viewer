import {
  AbortablePromise,
  EngineError,
  EngineErrorCode,
  encodeFieldRefKey,
  type DocumentEventInit,
  type DocumentFormsService,
  type FormDataExport,
  type FormDataFormat,
  type FormEffect,
  type FormEffectsResult,
  type FormFieldCreateResult,
  type FormFieldDeleteResult,
  type FormFieldDraft,
  type FormFieldDTO,
  type FormFieldPatch,
  type FormFieldRef,
  type FormFieldUpdateResult,
  type FormFieldValue,
  type FormImportResult,
  type FormRepairOptions,
  type FormRepairResult,
  type FormSetValueResult,
  type FormSnapshot,
  type FormWidgetLinkResult,
  type FormWidgetRef,
  type MutationMeta,
} from '@embedpdf/engine-core/runtime';
import {
  FormFieldCreateResultSchema,
  FormFieldDeleteResultSchema,
  FormFieldDTOSchema,
  FormFieldUpdateResultSchema,
  FormEffectsResultSchema,
  FormImportResultSchema,
  FormRepairResultSchema,
  FormSetValueResultSchema,
  FormSnapshotSchema,
  FormWidgetLinkResultSchema,
  wirePaths,
} from '@embedpdf/engine-core/wire';
import type { SessionEventPublisher } from '@embedpdf/engine-services';

import type { ManifestAccessor } from './CloudDocumentHandle';
import type { HttpClient } from '../transport/HttpClient';

/** Content types the import POST body may carry; the server sniffs the
 *  actual format from the bytes, so this is advisory only. */
const IMPORT_CONTENT_TYPE: Record<FormDataFormat, string> = {
  fdf: 'application/vnd.fdf',
  xfdf: 'application/vnd.adobe.xfdf',
};

/**
 * Cloud-side document forms service. Mirrors the local wiring: each call
 * produces an `AbortablePromise` that propagates `signal.abort()` down to
 * `fetch` and validates the JSON response with the wire-stable Zod schema.
 *
 * Forms are document-scoped, so reads use the unversioned `/form` URLs
 * (always `no-store` — there is no content-addressed variant). Mutation
 * results carry the per-page `cacheDelta` for pages whose widget
 * appearances changed; `absorbMutation` folds it into the cached manifest
 * so annotation/render reads stay coherent.
 */
export class CloudDocumentFormsService implements DocumentFormsService {
  constructor(
    private readonly http: HttpClient,
    private readonly docId: string,
    private readonly layerName: string,
    private readonly isClosed: () => boolean,
    private readonly manifest: ManifestAccessor,
    private readonly publisher: SessionEventPublisher,
  ) {}

  list(): AbortablePromise<FormSnapshot> {
    const rejected = this.rejectIfClosed<FormSnapshot>();
    if (rejected) return rejected;
    return AbortablePromise.run<FormSnapshot>((signal) =>
      this.http.getJson(
        wirePaths.layerForm(this.docId, this.layerName),
        (raw) => FormSnapshotSchema.parse(raw),
        signal,
      ),
    );
  }

  get(ref: FormFieldRef): AbortablePromise<FormFieldDTO> {
    const rejected = this.rejectIfClosed<FormFieldDTO>();
    if (rejected) return rejected;
    return AbortablePromise.run<FormFieldDTO>((signal) =>
      this.http.getJson(
        wirePaths.layerFormFieldByKey(this.docId, this.layerName, encodeFieldRefKey(ref)),
        (raw) => FormFieldDTOSchema.parse(raw),
        signal,
      ),
    );
  }

  setValue(ref: FormFieldRef, value: FormFieldValue): AbortablePromise<FormSetValueResult> {
    const rejected = this.rejectIfClosed<FormSetValueResult>();
    if (rejected) return rejected;
    return AbortablePromise.run<FormSetValueResult>(async (signal) => {
      const result = await this.http.postJson(
        wirePaths.layerFormFieldValue(this.docId, this.layerName, encodeFieldRefKey(ref)),
        { value },
        (raw) => FormSetValueResultSchema.parse(raw),
        signal,
      );
      return this.absorbMutation(result, 'form.valueChanged');
    });
  }

  reset(ref: FormFieldRef): AbortablePromise<FormSetValueResult> {
    const rejected = this.rejectIfClosed<FormSetValueResult>();
    if (rejected) return rejected;
    return AbortablePromise.run<FormSetValueResult>(async (signal) => {
      const result = await this.http.postJson(
        wirePaths.layerFormFieldReset(this.docId, this.layerName, encodeFieldRefKey(ref)),
        {},
        (raw) => FormSetValueResultSchema.parse(raw),
        signal,
      );
      return this.absorbMutation(result, 'form.valueChanged');
    });
  }

  applyEffects(effects: FormEffect[]): AbortablePromise<FormEffectsResult> {
    const rejected = this.rejectIfClosed<FormEffectsResult>();
    if (rejected) return rejected;
    return AbortablePromise.run<FormEffectsResult>(async (signal) => {
      const result = await this.http.postJson(
        wirePaths.layerFormEffects(this.docId, this.layerName),
        { effects },
        (raw) => FormEffectsResultSchema.parse(raw),
        signal,
      );
      // An all-no-op/all-preflight-rejected batch deliberately has no
      // artifact, cache advance, or event.
      if (result.meta === null) return result;
      this.manifest.apply(result.meta);
      this.publisher.publishLocal({ type: 'form.effectsApplied', ...result });
      return result;
    });
  }

  exportData(format: FormDataFormat = 'xfdf'): AbortablePromise<FormDataExport> {
    const rejected = this.rejectIfClosed<FormDataExport>();
    if (rejected) return rejected;
    return AbortablePromise.run<FormDataExport>(async (signal) => {
      const bytes = await this.http.getBytes(
        wirePaths.layerFormData(this.docId, this.layerName, format),
        signal,
      );
      return { format, bytes };
    });
  }

  importData(
    data: Uint8Array | ArrayBuffer,
    format?: FormDataFormat,
  ): AbortablePromise<FormImportResult> {
    const rejected = this.rejectIfClosed<FormImportResult>();
    if (rejected) return rejected;
    const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
    return AbortablePromise.run<FormImportResult>(async (signal) => {
      const result = await this.http.postBytesJson(
        wirePaths.layerFormData(this.docId, this.layerName, format),
        bytes,
        format ? IMPORT_CONTENT_TYPE[format] : 'application/octet-stream',
        (raw) => FormImportResultSchema.parse(raw),
        signal,
      );
      return this.absorbMutation(result, 'form.imported');
    });
  }

  createField(draft: FormFieldDraft): AbortablePromise<FormFieldCreateResult> {
    const rejected = this.rejectIfClosed<FormFieldCreateResult>();
    if (rejected) return rejected;
    return AbortablePromise.run<FormFieldCreateResult>(async (signal) => {
      const result = await this.http.postJson(
        wirePaths.layerFormFields(this.docId, this.layerName),
        draft,
        (raw) => FormFieldCreateResultSchema.parse(raw),
        signal,
      );
      return this.absorbMutation(result, 'form.fieldCreated');
    });
  }

  updateField(ref: FormFieldRef, patch: FormFieldPatch): AbortablePromise<FormFieldUpdateResult> {
    const rejected = this.rejectIfClosed<FormFieldUpdateResult>();
    if (rejected) return rejected;
    return AbortablePromise.run<FormFieldUpdateResult>(async (signal) => {
      const result = await this.http.patchJson(
        wirePaths.layerFormFieldByKey(this.docId, this.layerName, encodeFieldRefKey(ref)),
        patch,
        (raw) => FormFieldUpdateResultSchema.parse(raw),
        signal,
      );
      return this.absorbMutation(result, 'form.fieldUpdated');
    });
  }

  deleteField(ref: FormFieldRef): AbortablePromise<FormFieldDeleteResult> {
    const rejected = this.rejectIfClosed<FormFieldDeleteResult>();
    if (rejected) return rejected;
    return AbortablePromise.run<FormFieldDeleteResult>(async (signal) => {
      const result = await this.http.deleteJson(
        wirePaths.layerFormFieldByKey(this.docId, this.layerName, encodeFieldRefKey(ref)),
        (raw) => FormFieldDeleteResultSchema.parse(raw),
        signal,
      );
      return this.absorbMutation(result, 'form.fieldDeleted');
    });
  }

  attachWidget(
    ref: FormFieldRef,
    widget: FormWidgetRef,
    options?: { onState?: string },
  ): AbortablePromise<FormWidgetLinkResult> {
    const rejected = this.rejectIfClosed<FormWidgetLinkResult>();
    if (rejected) return rejected;
    const onState = options?.onState;
    return AbortablePromise.run<FormWidgetLinkResult>(async (signal) => {
      const result = await this.http.postJson(
        wirePaths.layerFormFieldWidgets(this.docId, this.layerName, encodeFieldRefKey(ref)),
        { widget, ...(onState ? { onState } : {}) },
        (raw) => FormWidgetLinkResultSchema.parse(raw),
        signal,
      );
      return this.absorbMutation(result, 'form.widgetAttached');
    });
  }

  detachWidget(ref: FormFieldRef, widget: FormWidgetRef): AbortablePromise<FormWidgetLinkResult> {
    const rejected = this.rejectIfClosed<FormWidgetLinkResult>();
    if (rejected) return rejected;
    return AbortablePromise.run<FormWidgetLinkResult>(async (signal) => {
      const result = await this.http.postJson(
        wirePaths.layerFormFieldWidgetsDetach(this.docId, this.layerName, encodeFieldRefKey(ref)),
        { widget },
        (raw) => FormWidgetLinkResultSchema.parse(raw),
        signal,
      );
      return this.absorbMutation(result, 'form.widgetDetached');
    });
  }

  repair(options?: FormRepairOptions): AbortablePromise<FormRepairResult> {
    const rejected = this.rejectIfClosed<FormRepairResult>();
    if (rejected) return rejected;
    return AbortablePromise.run<FormRepairResult>(async (signal) => {
      const result = await this.http.postJson(
        wirePaths.layerFormRepair(this.docId, this.layerName),
        { bakeAppearances: options?.bakeAppearances ?? false },
        (raw) => FormRepairResultSchema.parse(raw),
        signal,
      );
      return this.absorbMutation(result, 'form.repaired');
    });
  }

  private rejectIfClosed<T>(): AbortablePromise<T> | null {
    if (this.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document ${this.docId} is closed`),
      );
    }
    return null;
  }

  /**
   * Patch the cached manifest, then publish the mutation to the document's
   * event stream (in that order — listeners reading the manifest in their
   * callback must see post-mutation state). Same rails as annotations.
   */
  private absorbMutation<T extends { meta: MutationMeta }>(
    result: T,
    type:
      | 'form.valueChanged'
      | 'form.imported'
      | 'form.repaired'
      | 'form.fieldCreated'
      | 'form.fieldUpdated'
      | 'form.fieldDeleted'
      | 'form.widgetAttached'
      | 'form.widgetDetached',
  ): T {
    this.manifest.apply(result.meta);
    this.publisher.publishLocal({ type, ...result } as unknown as DocumentEventInit);
    return result;
  }
}
