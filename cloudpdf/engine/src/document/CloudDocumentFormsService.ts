import {
  opIdOf,
  AbortablePromise,
  EngineError,
  EngineErrorCode,
  deletedFieldOf,
  encodeFieldRefKey,
  formResetFacts,
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
  type SignatureAppearanceInput,
  type FormFieldValue,
  type FormImportResult,
  type FormRepairOptions,
  type FormRepairResult,
  type FormSetValueResult,
  type FormSnapshot,
  type FormWidgetLinkResult,
  type FormWidgetDeleteResult,
  type FormWidgetUpdateResult,
  type FormWidgetsReorderResult,
  type FormCalculationsReorderResult,
  type FieldPosition,
  type WidgetPatch,
  encodeAnnotKey,
  type AnnotationPosition,
  type AnnotationRef,
  type MutationMeta,
  type FormResetResult,
  type WidgetPlacement,
  type WriteOptions,
  type FormFieldCreateOptions,
  type FormWidgetAddOptions,
} from '@embedpdf/engine-core/runtime';
import {
  FormFieldCreateResultSchema,
  FormFieldDeleteResultSchema,
  FormFieldDTOSchema,
  FormFieldUpdateResultSchema,
  FormEffectsResultSchema,
  FormImportResultSchema,
  FormRepairResultSchema,
  FormResetResultSchema,
  FormSetValueResultSchema,
  FormSnapshotSchema,
  FormWidgetLinkResultSchema,
  FormWidgetDeleteResultSchema,
  FormWidgetUpdateResultSchema,
  FormWidgetsReorderResultSchema,
  FormCalculationsReorderResultSchema,
  wirePaths,
} from '@embedpdf/engine-core/wire';
import type { SessionEventPublisher } from '@embedpdf/engine-services';

import { buildRoleMutationForm } from './buildMutationForm';
import type { ManifestAccessor } from './CloudDocumentHandle';
import type { CloudWrites } from './CloudWrites';
import { planesInherited } from './planes';
import { withObjectNumbers } from '../shared/withObjectNumbers';
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
 * The form is its own read family: `list()` reads the immutable `form@`
 * leaf at the manifest's `formsVersion`. Mutation results carry the
 * `cacheDelta` of the form's pins (`formsVersion`, and each changed widget
 * page's `widgetVersion`); `absorbMutation` folds it into the cached
 * manifest and owns the `forms` plane.
 */
export class CloudDocumentFormsService implements DocumentFormsService {
  constructor(
    private readonly http: HttpClient,
    private readonly docId: string,
    private readonly layerName: string,
    private readonly isClosed: () => boolean,
    private readonly manifest: ManifestAccessor,
    private readonly publisher: SessionEventPublisher,
    private readonly writes: CloudWrites,
  ) {}

  /**
   * The form: one read of the immutable `form@formsVersion=N` leaf at the
   * manifest's pin, at the base's URL while the layer inherits the `forms`
   * plane, CDN-cacheable because the pin moves only when the form does. A
   * stale pin (a write landed → 404) refreshes the manifest and reads again,
   * once.
   */
  list(): AbortablePromise<FormSnapshot> {
    const rejected = this.rejectIfClosed<FormSnapshot>();
    if (rejected) return rejected;
    return AbortablePromise.run<FormSnapshot>((signal) =>
      this.http.getJsonWithRefresh(
        async (s) => {
          const manifest = await this.manifest.get(s);
          return planesInherited(manifest, ['forms'])
            ? wirePaths.docForm(this.docId, manifest.formsVersion)
            : wirePaths.layerForm(this.docId, this.layerName, manifest.formsVersion);
        },
        (raw) => FormSnapshotSchema.parse(raw),
        async (s) => {
          await this.manifest.refresh(s);
        },
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

  setValue(
    ref: FormFieldRef,
    value: FormFieldValue,
    options?: WriteOptions,
  ): AbortablePromise<FormSetValueResult> {
    const rejected = this.rejectIfClosed<FormSetValueResult>();
    if (rejected) return rejected;
    return AbortablePromise.run<FormSetValueResult>(async (signal) => {
      const opId = opIdOf(options);
      return this.writes.run(opId, signal, async (write) => {
        const result = await write.send((sent) =>
          this.http.postJson(
            wirePaths.layerFormFieldValue(this.docId, this.layerName, encodeFieldRefKey(ref)),
            { value },
            (raw) => FormSetValueResultSchema.parse(raw),
            signal,
            sent,
          ),
        );
        return this.absorbMutation(opId, result, 'forms.valueSet');
      });
    });
  }

  reset(
    fields?: FormFieldRef | FormFieldRef[],
    options?: WriteOptions,
  ): AbortablePromise<FormResetResult> {
    const rejected = this.rejectIfClosed<FormResetResult>();
    if (rejected) return rejected;
    const refs = fields === undefined ? undefined : Array.isArray(fields) ? fields : [fields];
    return AbortablePromise.run<FormResetResult>(async (signal) => {
      const opId = opIdOf(options);
      return this.writes.run(opId, signal, async (write) => {
        const result = await write.send((sent) =>
          this.http.postJson(
            wirePaths.layerFormReset(this.docId, this.layerName),
            refs ? { refs } : {},
            (raw) => FormResetResultSchema.parse(raw),
            signal,
            sent,
          ),
        );
        this.manifest.apply(result.meta, ['forms']);
        // One event per field that changed, sharing the write's opId.
        this.publisher.publishWrite(
          opId,
          ...formResetFacts(result).map((fact) => ({ type: 'forms.valueSet' as const, ...fact })),
        );
        return result;
      });
    });
  }

  applyEffects(effects: FormEffect[], options?: WriteOptions): AbortablePromise<FormEffectsResult> {
    const rejected = this.rejectIfClosed<FormEffectsResult>();
    if (rejected) return rejected;
    return AbortablePromise.run<FormEffectsResult>(async (signal) => {
      const opId = opIdOf(options);
      return this.writes.run(opId, signal, async (write) => {
        const result = await write.send((sent) =>
          this.http.postJson(
            wirePaths.layerFormEffects(this.docId, this.layerName),
            { effects },
            (raw) => FormEffectsResultSchema.parse(raw),
            signal,
            sent,
          ),
        );
        // A batch that wrote nothing (every effect a no-op or rejected in
        // preflight) comes back without a cache delta: no artifact, cache
        // advance, or event.
        if (result.meta.cacheDelta === null) return result;
        this.manifest.apply(result.meta, ['forms']);
        this.publisher.publishWrite(opId, { type: 'forms.effectsApplied', ...result });
        return result;
      });
    });
  }

  export(format: FormDataFormat = 'xfdf'): AbortablePromise<FormDataExport> {
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

  import(
    data: Uint8Array | ArrayBuffer,
    format?: FormDataFormat,
    options?: WriteOptions,
  ): AbortablePromise<FormImportResult> {
    const rejected = this.rejectIfClosed<FormImportResult>();
    if (rejected) return rejected;
    const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
    return AbortablePromise.run<FormImportResult>(async (signal) => {
      const opId = opIdOf(options);
      return this.writes.run(opId, signal, async (write) => {
        const result = await write.send((sent) =>
          this.http.postBytesJson(
            wirePaths.layerFormData(this.docId, this.layerName, format),
            bytes,
            format ? IMPORT_CONTENT_TYPE[format] : 'application/octet-stream',
            (raw) => FormImportResultSchema.parse(raw),
            signal,
            sent,
          ),
        );
        return this.absorbMutation(opId, result, 'forms.imported');
      });
    });
  }

  create(
    draft: FormFieldDraft,
    options: FormFieldCreateOptions = {},
  ): AbortablePromise<FormFieldCreateResult> {
    const rejected = this.rejectIfClosed<FormFieldCreateResult>();
    if (rejected) return rejected;
    return AbortablePromise.run<FormFieldCreateResult>(async (signal) => {
      const opId = opIdOf(options);
      const { objectNumber, widgetObjectNumbers } = options;
      return this.writes.run(
        opId,
        signal,
        async (write) => {
          const result = await write.send((sent) =>
            this.http.postJson(
              withObjectNumbers(wirePaths.layerFormFields(this.docId, this.layerName), {
                objectNumber,
                widgetObjectNumbers,
              }),
              draft,
              (raw) => FormFieldCreateResultSchema.parse(raw),
              signal,
              sent,
            ),
          );
          return this.absorbMutation(opId, result, 'forms.created');
        },
        [objectNumber, ...(widgetObjectNumbers ?? [])],
      );
    });
  }

  update(
    ref: FormFieldRef,
    patch: FormFieldPatch,
    options?: WriteOptions,
  ): AbortablePromise<FormFieldUpdateResult> {
    const rejected = this.rejectIfClosed<FormFieldUpdateResult>();
    if (rejected) return rejected;
    return AbortablePromise.run<FormFieldUpdateResult>(async (signal) => {
      const opId = opIdOf(options);
      return this.writes.run(opId, signal, async (write) => {
        const result = await write.send((sent) =>
          this.http.patchJson(
            wirePaths.layerFormFieldByKey(this.docId, this.layerName, encodeFieldRefKey(ref)),
            patch,
            (raw) => FormFieldUpdateResultSchema.parse(raw),
            signal,
            sent,
          ),
        );
        return this.absorbMutation(opId, result, 'forms.updated');
      });
    });
  }

  setSignatureAppearance(
    ref: FormFieldRef,
    appearance: SignatureAppearanceInput,
    options?: WriteOptions,
  ): AbortablePromise<FormFieldUpdateResult> {
    const rejected = this.rejectIfClosed<FormFieldUpdateResult>();
    if (rejected) return rejected;
    return AbortablePromise.run<FormFieldUpdateResult>(async (signal) => {
      const opId = opIdOf(options);
      return this.writes.run(opId, signal, async (write) => {
        const bytes = new ArrayBuffer(appearance.pdf.byteLength);
        new Uint8Array(bytes).set(appearance.pdf);
        const form = buildRoleMutationForm(
          {},
          { appearance: { bytes, mimeType: 'application/pdf', name: 'appearance.pdf' } },
        );
        const result = await write.send((sent) =>
          this.http.postMultipartJson(
            wirePaths.layerFormFieldSignatureAppearance(
              this.docId,
              this.layerName,
              encodeFieldRefKey(ref),
            ),
            form,
            (raw) => FormFieldUpdateResultSchema.parse(raw),
            signal,
            sent,
          ),
        );
        return this.absorbMutation(opId, result, 'forms.updated');
      });
    });
  }

  delete(ref: FormFieldRef, options?: WriteOptions): AbortablePromise<FormFieldDeleteResult> {
    const rejected = this.rejectIfClosed<FormFieldDeleteResult>();
    if (rejected) return rejected;
    return AbortablePromise.run<FormFieldDeleteResult>(async (signal) => {
      const opId = opIdOf(options);
      return this.writes.run(opId, signal, async (write) => {
        const result = await write.send((sent) =>
          this.http.deleteJson(
            wirePaths.layerFormFieldByKey(this.docId, this.layerName, encodeFieldRefKey(ref)),
            (raw) => FormFieldDeleteResultSchema.parse(raw),
            signal,
            sent,
          ),
        );
        this.manifest.apply(result.meta, ['forms']);
        this.publisher.publishWrite(opId, {
          type: 'forms.deleted',
          deleted: deletedFieldOf(result),
          ...result,
        });
        return result;
      });
    });
  }

  addWidget(
    ref: FormFieldRef,
    placement: WidgetPlacement,
    options: FormWidgetAddOptions = {},
  ): AbortablePromise<FormWidgetLinkResult> {
    const rejected = this.rejectIfClosed<FormWidgetLinkResult>();
    if (rejected) return rejected;
    return AbortablePromise.run<FormWidgetLinkResult>(async (signal) => {
      const opId = opIdOf(options);
      const { objectNumber, splitObjectNumber } = options;
      return this.writes.run(
        opId,
        signal,
        async (write) => {
          const result = await write.send((sent) =>
            this.http.postJson(
              withObjectNumbers(
                wirePaths.layerFormFieldWidgets(this.docId, this.layerName, encodeFieldRefKey(ref)),
                { objectNumber, splitObjectNumber },
              ),
              placement,
              (raw) => FormWidgetLinkResultSchema.parse(raw),
              signal,
              sent,
            ),
          );
          return this.absorbMutation(opId, result, 'forms.widgetAdded');
        },
        [objectNumber, splitObjectNumber],
      );
    });
  }

  removeWidget(
    ref: FormFieldRef,
    widget: AnnotationRef,
    options?: WriteOptions,
  ): AbortablePromise<FormWidgetLinkResult> {
    const rejected = this.rejectIfClosed<FormWidgetLinkResult>();
    if (rejected) return rejected;
    return AbortablePromise.run<FormWidgetLinkResult>(async (signal) => {
      const opId = opIdOf(options);
      return this.writes.run(opId, signal, async (write) => {
        const result = await write.send((sent) =>
          this.http.postJson(
            wirePaths.layerFormFieldWidgetsDetach(
              this.docId,
              this.layerName,
              encodeFieldRefKey(ref),
            ),
            { widget },
            (raw) => FormWidgetLinkResultSchema.parse(raw),
            signal,
            sent,
          ),
        );
        return this.absorbMutation(opId, result, 'forms.widgetRemoved');
      });
    });
  }

  updateWidget(
    widget: AnnotationRef,
    patch: WidgetPatch,
    options?: WriteOptions,
  ): AbortablePromise<FormWidgetUpdateResult> {
    const rejected = this.rejectIfClosed<FormWidgetUpdateResult>();
    if (rejected) return rejected;
    return AbortablePromise.run<FormWidgetUpdateResult>(async (signal) => {
      const opId = opIdOf(options);
      return this.writes.run(opId, signal, async (write) => {
        const result = await write.send((sent) =>
          this.http.patchJson(
            wirePaths.layerFormWidget(
              this.docId,
              this.layerName,
              widget.page,
              encodeAnnotKey(widget),
            ),
            { patch },
            (raw) => FormWidgetUpdateResultSchema.parse(raw),
            signal,
            sent,
          ),
        );
        return this.absorbMutation(opId, result, 'forms.widgetUpdated');
      });
    });
  }

  deleteWidget(
    widget: AnnotationRef,
    options?: WriteOptions,
  ): AbortablePromise<FormWidgetDeleteResult> {
    const rejected = this.rejectIfClosed<FormWidgetDeleteResult>();
    if (rejected) return rejected;
    return AbortablePromise.run<FormWidgetDeleteResult>(async (signal) => {
      const opId = opIdOf(options);
      return this.writes.run(opId, signal, async (write) => {
        const result = await write.send((sent) =>
          this.http.deleteJson(
            wirePaths.layerFormWidget(
              this.docId,
              this.layerName,
              widget.page,
              encodeAnnotKey(widget),
            ),
            (raw) => FormWidgetDeleteResultSchema.parse(raw),
            signal,
            sent,
          ),
        );
        return this.absorbMutation(opId, result, 'forms.widgetDeleted');
      });
    });
  }

  reorderCalculations(
    fields: FormFieldRef[],
    position: FieldPosition,
    options?: WriteOptions,
  ): AbortablePromise<FormCalculationsReorderResult> {
    const rejected = this.rejectIfClosed<FormCalculationsReorderResult>();
    if (rejected) return rejected;
    return AbortablePromise.run<FormCalculationsReorderResult>(async (signal) => {
      const opId = opIdOf(options);
      return this.writes.run(opId, signal, async (write) => {
        const result = await write.send((sent) =>
          this.http.postJson(
            wirePaths.layerFormCalculationsReorder(this.docId, this.layerName),
            { fields, position },
            (raw) => FormCalculationsReorderResultSchema.parse(raw),
            signal,
            sent,
          ),
        );
        return this.absorbMutation(opId, result, 'forms.calculationsReordered');
      });
    });
  }

  reorderWidgets(
    widgets: AnnotationRef[],
    position: AnnotationPosition,
    options?: WriteOptions,
  ): AbortablePromise<FormWidgetsReorderResult> {
    const rejected = this.rejectIfClosed<FormWidgetsReorderResult>();
    if (rejected) return rejected;
    // The widgets' page is part of the URL; the server checks they are all on it.
    const page = widgets[0]?.page;
    if (!page) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.InvalidArg, 'a reorder names at least one widget', {
          details: { field: 'widgets' },
        }),
      );
    }
    return AbortablePromise.run<FormWidgetsReorderResult>(async (signal) => {
      const opId = opIdOf(options);
      return this.writes.run(opId, signal, async (write) => {
        const result = await write.send((sent) =>
          this.http.postJson(
            wirePaths.layerFormWidgetsReorder(this.docId, this.layerName, page),
            { widgets, position },
            (raw) => FormWidgetsReorderResultSchema.parse(raw),
            signal,
            sent,
          ),
        );
        return this.absorbMutation(opId, result, 'forms.widgetsReordered');
      });
    });
  }

  repair(options?: FormRepairOptions): AbortablePromise<FormRepairResult> {
    const rejected = this.rejectIfClosed<FormRepairResult>();
    if (rejected) return rejected;
    return AbortablePromise.run<FormRepairResult>(async (signal) => {
      const opId = opIdOf(options);
      return this.writes.run(opId, signal, async (write) => {
        const result = await write.send((sent) =>
          this.http.postJson(
            wirePaths.layerFormRepair(this.docId, this.layerName),
            { bakeAppearances: options?.bakeAppearances ?? false },
            (raw) => FormRepairResultSchema.parse(raw),
            signal,
            sent,
          ),
        );
        return this.absorbMutation(opId, result, 'forms.repaired');
      });
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
    opId: string,
    result: T,
    type:
      | 'forms.valueSet'
      | 'forms.imported'
      | 'forms.repaired'
      | 'forms.created'
      | 'forms.updated'
      | 'forms.widgetAdded'
      | 'forms.widgetRemoved'
      | 'forms.widgetUpdated'
      | 'forms.widgetDeleted'
      | 'forms.widgetsReordered'
      | 'forms.calculationsReordered',
  ): T {
    this.manifest.apply(result.meta, ['forms']);
    this.publisher.publishWrite(opId, { type, ...result } as unknown as DocumentEventInit);
    return result;
  }
}
