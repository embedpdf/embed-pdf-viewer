import type { FormFieldDraft } from '../forms/draft';
import type { FormFieldDTO } from '../forms/field';
import type { FormFieldPatch } from '../forms/patch';
import type { FormSnapshot } from '../forms/snapshot';
import type { FormDataFormat, FormFieldValue } from '../forms/value';
import type { FormEffect, FormEffectsResult } from '../forms/effects';
import type { FormSubmissionReceipt, FormSubmissionRequest } from '../forms/submission';
import type { FormFieldRef, FormWidgetRef } from '../identity/FormFieldRef';
import type {
  FormDataExport,
  FormFieldCreateResult,
  FormFieldDeleteResult,
  FormFieldUpdateResult,
  FormImportResult,
  FormRepairResult,
  FormSetValueResult,
  FormWidgetLinkResult,
} from '../mutation/FormMutationResults';
import type { AbortablePromise } from '../promise/AbortablePromise';

/** Options for {@link DocumentFormsService.repair}. */
export interface FormRepairOptions {
  /**
   * Also regenerate widget appearance streams: widgets with no /AP get
   * one, and when the /AcroForm sets /NeedAppearances every widget is
   * re-baked and the flag cleared, making rendering deterministic across
   * viewers.
   */
  bakeAppearances?: boolean;
}

/**
 * The document's interactive form: a document-scoped record system where
 * fields hold the values and widget annotations are their page-scoped
 * views. Filling mutates the field plane; rendering only ever reads the
 * widget plane (through the annotation subsystem — join widgets to
 * annotations via `FormFieldWidget.annotObjectNumber`).
 *
 * Reads are gated by `doc.forms.read`, value writes and imports by
 * `doc.forms.fill`, and repair by `doc.forms.modify`. On layer documents
 * every write lands as a minimal delta over the shared immutable base — a
 * filled form layer is semantically an FDF diff.
 */
export interface DocumentFormsService {
  /**
   * The complete reconciled form state: every terminal field with its
   * effective value, options, and widgets. Fields broken producers left
   * out of /AcroForm /Fields are included with `origin: 'recovered'`.
   */
  list(): AbortablePromise<FormSnapshot>;

  /**
   * One field by ref. Prefer `objectNumber` refs (durable); `fqn` refs
   * resolve against the current field tree. Fails with `NotFound` when
   * the ref matches nothing.
   */
  get(ref: FormFieldRef): AbortablePromise<FormFieldDTO>;

  /**
   * Write one field's value. The value's `type` must match the field
   * family (see {@link FormFieldValue}). Validation happens before any
   * write — a failed call leaves the document untouched. Appearance
   * streams regenerate for text/choice widgets; toggles flip their
   * appearance state. Emits `form.valueChanged`.
   */
  setValue(ref: FormFieldRef, value: FormFieldValue): AbortablePromise<FormSetValueResult>;

  /**
   * Restore a field to its default value (/DV), or clear it when no
   * default exists. Emits `form.valueChanged`.
   */
  reset(ref: FormFieldRef): AbortablePromise<FormSetValueResult>;

  /**
   * Apply one script run's ordered effects as one worker/cloud job. The batch
   * is not rollback-atomic. All references are preflighted before writes;
   * after a post-preflight internal failure the remaining effects are marked
   * skipped and any landed state is finalized as one artifact/event/version.
   */
  applyEffects?(effects: FormEffect[]): AbortablePromise<FormEffectsResult>;

  /**
   * Deliver a resolved form submission to the document's HOME. Present only
   * where the document HAS a home that accepts submissions — the cloud
   * engine when the deployment advertises the capability; the local engine
   * truthfully lacks it (an in-process document has no home, and this
   * contract is never a callback trampoline). Gated by `doc.forms.submit`
   * (grant-minted; no PDF permission bit exists for submission), asserted
   * at the home's boundary where enforcement is real. The home stores the
   * dataset with the declared intent as metadata and derives WHO submitted
   * from its own verified session — it never fetches the PDF's URL.
   */
  submit?(request: FormSubmissionRequest): AbortablePromise<FormSubmissionReceipt>;

  /**
   * Serialize the form data for interchange. Defaults to `'xfdf'` (the
   * XML sibling; UTF-8, friendliest to web pipelines) — pass `'fdf'` for
   * the PDF-native container. Exports read the same reconciled view as
   * `list()`, so recovered fields are included and, on layer documents,
   * filled values win over the base.
   */
  exportData(format?: FormDataFormat): AbortablePromise<FormDataExport>;

  /**
   * Apply an FDF or XFDF payload. The format is sniffed from the bytes
   * when `format` is omitted. Each entry replays through the same typed,
   * validated write path as `setValue` — one bad entry is skipped and
   * counted, never fatal. Emits `form.imported`.
   */
  importData(
    data: Uint8Array | ArrayBuffer,
    format?: FormDataFormat,
  ): AbortablePromise<FormImportResult>;

  /**
   * Create a logical form field, optionally with styled widgets, in one
   * atomic job. Widgets are born through the annotation plane and adopted
   * (see {@link attachWidget}); the inline `widget(s)` config is sugar for
   * exactly that composition. Gated by `doc.forms.modify`. Emits
   * `form.fieldCreated`.
   */
  createField(draft: FormFieldDraft): AbortablePromise<FormFieldCreateResult>;

  /**
   * Update field-plane properties (name, universal and family flags,
   * options, default value, names). The patch's `family` must match the
   * target field. Validate-then-apply per property. Emits
   * `form.fieldUpdated`.
   */
  updateField(ref: FormFieldRef, patch: FormFieldPatch): AbortablePromise<FormFieldUpdateResult>;

  /**
   * Delete a terminal field and cascade: every widget is removed from its
   * page, the field leaves the tree, and empty ancestors are pruned.
   * Emits `form.fieldDeleted`.
   */
  deleteField(ref: FormFieldRef): AbortablePromise<FormFieldDeleteResult>;

  /**
   * Adopt an existing, unattached widget annotation as a view of the
   * field. `onState` names the checked appearance state and is required
   * for radio groups (checkboxes default to "Yes"). Attaching into a
   * legacy merged field splits it — the FIELD object number never
   * changes; widget identity may. Emits `form.widgetAttached`.
   */
  attachWidget(
    ref: FormFieldRef,
    widget: FormWidgetRef,
    options?: { onState?: string },
  ): AbortablePromise<FormWidgetLinkResult>;

  /**
   * The inverse of {@link attachWidget}: the widget keeps its page
   * placement and last appearance but becomes an ordinary, inert
   * annotation (deletable through the annotation APIs). The field
   * survives, "unplaced" when this was its last widget. Emits
   * `form.widgetDetached`.
   */
  detachWidget(ref: FormFieldRef, widget: FormWidgetRef): AbortablePromise<FormWidgetLinkResult>;

  /**
   * Make the engine's read-time reconciliation durable in the document
   * ("form doctor"): bootstrap a missing /AcroForm, link recovered field
   * roots into /Fields, re-attach stray widgets to their parent's /Kids,
   * and optionally bake appearances. Validate-then-apply and idempotent —
   * a second call reports zero fixes. Emits `form.repaired`.
   */
  repair(options?: FormRepairOptions): AbortablePromise<FormRepairResult>;
}
