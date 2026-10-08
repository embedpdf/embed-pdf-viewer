import {
  opIdOf,
  AbortablePromise,
  EngineError,
  EngineErrorCode,
  deletedFieldOf,
  encodeFieldRefKey,
  formImportFacts,
  formResetFacts,
  formValuesImportFacts,
  assertFormBundle,
  assertFormBundleManifest,
  type BundleLimits,
  type DocumentEventInit,
  type DocumentFormsService,
  type DocumentManifest,
  type FormBundle,
  type FormEffect,
  type FormExportSelection,
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
  type FormImportBody,
  type FormImportOptions,
  type FormImportResult,
  type FormValuesImportBody,
  type FormValuesImportOptions,
  type FormValuesImportResult,
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
  FormValuesImportResultSchema,
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
import { bundleImportForm, NO_BUNDLE_LIMITS, readBundleParts } from '../transport/bundleMultipart';
import type { HttpClient } from '../transport/HttpClient';

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
    /** The server's import limits, as its `/v1/access` advertises them. */
    private readonly importLimits: () => Promise<BundleLimits>,
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

  /**
   * One versioned, CDN-cacheable read at the manifest's form and layout
   * pins, with the stale-pin retry (404 → refresh the manifest → once). The
   * response is the bundle without its bytes and one part per resource;
   * every part is checked against its id before it is returned.
   */
  export(selection: FormExportSelection = {}): AbortablePromise<FormBundle> {
    const rejected = this.rejectIfClosed<FormBundle>();
    if (rejected) return rejected;
    return AbortablePromise.run<FormBundle>(async (signal) => {
      const read = async (s: AbortSignal): Promise<FormData> => {
        const manifest = await this.manifest.get(s);
        const path = this.exportPathAt(manifest, selection);
        if (path) return this.http.getFormData(path, s);
        // More fields than a URL holds: the pins and the selection in a
        // POST body.
        return this.http.postJsonFormData(
          wirePaths.layerFormExportRequest(this.docId, this.layerName),
          {
            formsVersion: manifest.formsVersion,
            layoutVersion: manifest.layoutVersion,
            selection,
          },
          s,
        );
      };
      let form: FormData;
      try {
        form = await read(signal);
      } catch (error) {
        // A pin that moved since the manifest was read: read it again, once.
        if (!EngineError.is(error, EngineErrorCode.NotFound)) throw error;
        await this.manifest.refresh(signal);
        form = await read(signal);
      }
      const { body, resources } = await readBundleParts('form', form);
      const bundle = { ...(body as Omit<FormBundle, 'resources'>), resources };
      await assertFormBundle(bundle, NO_BUNDLE_LIMITS);
      return bundle;
    });
  }

  /**
   * One request: the bundle's manifest and each resource once, as parts of
   * one multipart POST under the import's `opId` as `Idempotency-Key`, so a
   * retry applies once. The server holds the limits; the same numbers are
   * checked here first, so a bundle past one fails before its bytes move.
   */
  import(bundle: FormBundle, options: FormImportOptions = {}): AbortablePromise<FormImportResult> {
    const rejected = this.rejectIfClosed<FormImportResult>();
    if (rejected) return rejected;
    return AbortablePromise.run<FormImportResult>(async (signal) => {
      const opId = opIdOf(options);
      return this.writes.run(opId, signal, async (write) => {
        const body: FormImportBody = {
          bundle: await this.checkedManifest(bundle),
          options: {
            ...(options.pages !== undefined ? { pages: options.pages } : {}),
            ...(options.attribution !== undefined ? { attribution: options.attribution } : {}),
            ...(options.values !== undefined ? { values: options.values } : {}),
          },
        };
        const result = await write.send((sent) =>
          this.http.postMultipartJson(
            wirePaths.layerFormImport(this.docId, this.layerName),
            bundleImportForm(body, bundle.resources),
            (raw) => FormImportResultSchema.parse(raw),
            signal,
            sent,
          ),
        );
        this.manifest.apply(result.meta, ['forms']);
        // One event per field it made, sharing the import's opId.
        this.publisher.publishWrite(
          opId,
          ...formImportFacts(result).map((fact) => ({
            type: 'forms.created' as const,
            ...fact,
          })),
        );
        return result;
      });
    });
  }

  /** One request, as {@link import} sends it. */
  importValues(
    bundle: FormBundle,
    options: FormValuesImportOptions = {},
  ): AbortablePromise<FormValuesImportResult> {
    const rejected = this.rejectIfClosed<FormValuesImportResult>();
    if (rejected) return rejected;
    return AbortablePromise.run<FormValuesImportResult>(async (signal) => {
      const opId = opIdOf(options);
      return this.writes.run(opId, signal, async (write) => {
        const body: FormValuesImportBody = {
          bundle: await this.checkedManifest(bundle),
          options: options.attribution !== undefined ? { attribution: options.attribution } : {},
        };
        const result = await write.send((sent) =>
          this.http.postMultipartJson(
            wirePaths.layerFormImportValues(this.docId, this.layerName),
            bundleImportForm(body, bundle.resources),
            (raw) => FormValuesImportResultSchema.parse(raw),
            signal,
            sent,
          ),
        );
        this.manifest.apply(result.meta, ['forms']);
        // One event per field it filled, sharing the import's opId.
        this.publisher.publishWrite(
          opId,
          ...formValuesImportFacts(result).map((fact) => ({
            type: 'forms.valueSet' as const,
            ...fact,
          })),
        );
        return result;
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

  /** The bundle without its bytes, checked against the server's limits first. */
  private async checkedManifest(bundle: FormBundle): Promise<Omit<FormBundle, 'resources'>> {
    const { resources, ...manifest } = bundle;
    const sizes = new Map(Object.entries(resources).map(([id, bytes]) => [id, bytes.length]));
    assertFormBundleManifest(bundle, sizes, await this.importLimits());
    return manifest;
  }

  /**
   * The cacheable export URL for `selection` at the manifest's pins — the
   * base leaf while the layer inherits both planes the bundle depends on —
   * or `null` when a URL can't carry it.
   */
  private exportPathAt(manifest: DocumentManifest, selection: FormExportSelection): string | null {
    const token = {
      formsVersion: manifest.formsVersion,
      layoutVersion: manifest.layoutVersion,
      selection,
    };
    try {
      return planesInherited(manifest, ['forms', 'layout'])
        ? wirePaths.docFormExport(this.docId, token)
        : wirePaths.layerFormExport(this.docId, this.layerName, token);
    } catch {
      return null;
    }
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
