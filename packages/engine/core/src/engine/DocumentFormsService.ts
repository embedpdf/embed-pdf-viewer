import type { WidgetPatch } from '../annotation/kinds/widget';
import type { AnnotationRef } from '../identity/AnnotationRef';
import type { FormFieldDraft, WidgetPlacement } from '../forms/draft';
import type { FormFieldDTO } from '../forms/field';
import type { FormFieldPatch } from '../forms/patch';
import type { FormSnapshot } from '../forms/snapshot';
import type { FormDataFormat, FormFieldValue } from '../forms/value';
import type { FormEffect, FormEffectsResult } from '../forms/effects';
import type { FormSubmissionReceipt, FormSubmissionRequest } from '../forms/submission';
import type { FormFieldRef } from '../identity/FormFieldRef';
import type { SignatureAppearanceInput } from '../signature/types';
import type {
  FormDataExport,
  FormFieldCreateResult,
  FormFieldDeleteResult,
  FormFieldUpdateResult,
  FormImportResult,
  FormRepairResult,
  FormResetResult,
  FormSetValueResult,
  FormWidgetDeleteResult,
  FormWidgetLinkResult,
  FormWidgetsReorderResult,
  FormWidgetUpdateResult,
} from '../mutation/FormMutationResults';
import type { AnnotationPosition } from '../mutation/ListPosition';
import type {
  FormFieldCreateOptions,
  FormWidgetAddOptions,
  WriteOptions,
} from '../mutation/WriteOptions';
import type { AbortablePromise } from '../promise/AbortablePromise';

/** Options for {@link DocumentFormsService.repair}. */
export interface FormRepairOptions extends WriteOptions {
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
 * views. A form field's widgets come with the form, never with the
 * annotations: `list()` holds the fields and every widget's row, and widget
 * writes are form writes.
 *
 * Reads are gated by `doc.forms.read`, value writes and imports by
 * `doc.forms.fill`, and repair by `doc.forms.modify`. On layer documents
 * every write lands as a minimal delta over the shared immutable base — a
 * filled form layer is semantically an FDF diff.
 */
export interface DocumentFormsService {
  /**
   * The complete reconciled form state: every terminal field with its
   * effective value and options, and every widget with its place, look and
   * state. Fields broken producers left out of /AcroForm /Fields are
   * included with `origin: 'recovered'`.
   */
  list(): AbortablePromise<FormSnapshot>;

  /**
   * One field by ref. Prefer `objectNumber` refs (durable); `fqn` refs
   * resolve against the current field tree. Fails with `NotFound` when
   * the ref matches nothing.
   */
  get(ref: FormFieldRef): AbortablePromise<FormFieldDTO>;

  /**
   * Write one field's value, in the fields a read of it returns (see
   * {@link FormFieldValue}). Validation happens before any write — a failed
   * call leaves the document untouched. Appearance streams regenerate for
   * text/choice widgets; toggles flip their appearance state. Emits
   * `forms.valueSet`.
   */
  setValue(
    ref: FormFieldRef,
    value: FormFieldValue,
    options?: WriteOptions,
  ): AbortablePromise<FormSetValueResult>;

  /**
   * Put fields back to their default value (/DV), or empty them when they
   * have none: the whole form without an argument, else the fields named.
   * Fields that hold no value (push buttons, signature fields) are skipped,
   * and so, in a whole-form reset, are fields a signature locked; naming a
   * locked field fails with `ProtectedDocument`. The result lists the
   * fields that changed. Emits one `forms.valueSet` per changed field,
   * sharing `origin.tx`.
   */
  reset(
    fields?: FormFieldRef | FormFieldRef[],
    options?: WriteOptions,
  ): AbortablePromise<FormResetResult>;

  /**
   * Apply one script run's ordered effects as one worker/cloud job. The batch
   * is not rollback-atomic. All references are preflighted before writes;
   * after a post-preflight internal failure the remaining effects are marked
   * skipped and any landed state is finalized as one artifact/event/version.
   */
  applyEffects(effects: FormEffect[], options?: WriteOptions): AbortablePromise<FormEffectsResult>;

  /**
   * Deliver a resolved form submission to the document's home. Present only
   * where the document has a home that accepts submissions — the cloud
   * engine when the deployment advertises the capability; the local engine
   * truthfully lacks it (an in-process document has no home, and this
   * contract is never a callback trampoline). Gated by `doc.forms.submit`
   * (grant-minted; no PDF permission bit exists for submission), asserted
   * at the home's boundary where enforcement is real. The home stores the
   * dataset with the declared intent as metadata and derives who submitted
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
  export(format?: FormDataFormat): AbortablePromise<FormDataExport>;

  /**
   * Apply an FDF or XFDF payload. The format is sniffed from the bytes
   * when `format` is omitted. Each entry replays through the same typed,
   * validated write path as `setValue` — one bad entry is skipped and
   * counted, never fatal. Emits `forms.imported`.
   */
  import(
    data: Uint8Array | ArrayBuffer,
    format?: FormDataFormat,
    options?: WriteOptions,
  ): AbortablePromise<FormImportResult>;

  /**
   * Create a logical form field, optionally with styled widgets, in one
   * atomic job. Widgets are born through the annotation plane and adopted
   * (see {@link addWidget}); the inline `widget(s)` config is sugar for
   * exactly that composition. Gated by `doc.forms.modify`. Emits
   * `forms.created`.
   *
   * `options.objectNumber` names the field and `options.widgetObjectNumbers`
   * its widgets (in `draft.widgets` order), all taken from
   * `doc.objectNumbers`, so their refs are known before the engine answers.
   * Parent fields created on the way get the next free numbers. A number
   * this session doesn't hold, or one an object already has, is refused
   * with `ObjectNumberUnavailable`.
   */
  create(
    draft: FormFieldDraft,
    options?: FormFieldCreateOptions,
  ): AbortablePromise<FormFieldCreateResult>;

  /**
   * Update field-plane properties (name, universal and family flags,
   * options, default value, names). The patch's `family` must match the
   * target field. Validate-then-apply per property. Emits
   * `forms.updated`.
   */
  update(
    ref: FormFieldRef,
    patch: FormFieldPatch,
    options?: WriteOptions,
  ): AbortablePromise<FormFieldUpdateResult>;

  /**
   * Draw a PDF page into every widget of an unsigned signature field — the
   * visual "sign" of a viewer that has no signer. The field's value stays
   * empty and nothing is sealed; a signed field is refused. Gated by
   * `doc.forms.fill`. Emits `forms.updated`.
   */
  setSignatureAppearance(
    ref: FormFieldRef,
    appearance: SignatureAppearanceInput,
    options?: WriteOptions,
  ): AbortablePromise<FormFieldUpdateResult>;

  /**
   * Delete a terminal field and cascade: every widget is removed from its
   * page, the field leaves the tree, and empty ancestors are pruned.
   * Emits `forms.deleted`.
   */
  delete(ref: FormFieldRef, options?: WriteOptions): AbortablePromise<FormFieldDeleteResult>;

  /**
   * Show the field in one more place: a new widget, placed and styled like
   * an entry of a draft's `widgets`, in one change. A radio button needs
   * its `exportValue`. Adding a widget to a legacy merged field splits it:
   * the field keeps its object number and its widget moves to a new one
   * (`options.splitObjectNumber`, or the next free one). Emits
   * `forms.widgetAdded`.
   *
   * `options.objectNumber` names the new widget, taken from
   * `doc.objectNumbers` like `splitObjectNumber`. A number this session
   * doesn't hold, or one an object already has, is refused with
   * `ObjectNumberUnavailable`.
   */
  addWidget(
    ref: FormFieldRef,
    placement: WidgetPlacement,
    options?: FormWidgetAddOptions,
  ): AbortablePromise<FormWidgetLinkResult>;

  /**
   * Take a widget out of its field: it keeps its page placement and last
   * appearance but belongs to no field any more (its `field` is `null`;
   * `deleteWidget` takes it off the page). The field survives, "unplaced"
   * when this was its last widget. Emits `forms.widgetRemoved`.
   */
  removeWidget(
    ref: FormFieldRef,
    widget: AnnotationRef,
    options?: WriteOptions,
  ): AbortablePromise<FormWidgetLinkResult>;

  /**
   * Delete a widget: it leaves its page, and its field when it has one. The
   * field survives, "unplaced" when this was its last widget. A widget that
   * is its field's own dictionary (a merged field/widget) is refused with
   * `InvalidArg`: delete the field with `delete`. A widget is the form's, so
   * `annotations.delete` refuses one. Gated by `doc.forms.modify`. Emits
   * `forms.widgetDeleted`.
   */
  deleteWidget(
    widget: AnnotationRef,
    options?: WriteOptions,
  ): AbortablePromise<FormWidgetDeleteResult>;

  /**
   * Change a widget's place and look: what `annotations.update` takes for a
   * widget (rect, colors, border, font, alignment, flags). A widget is the
   * form's, so `annotations.update` refuses one. Gated by
   * `doc.forms.modify`. Emits `forms.widgetUpdated`.
   */
  updateWidget(
    widget: AnnotationRef,
    patch: WidgetPatch,
    options?: WriteOptions,
  ): AbortablePromise<FormWidgetUpdateResult>;

  /**
   * Change the widgets' stacking order on their page: they go together, in
   * the order given, to `position` among the page's widgets, next to a
   * neighbour widget or at `'start'` (bottom) / `'end'` (top). Widgets paint
   * above every annotation, so only widgets are named here; an annotation is
   * refused with `InvalidArg` (`page.annotations.reorder()` orders those).
   * Where a page's `/Tabs` is `/A` or `/W`, this is also the fields' tab
   * order. Gated by `doc.forms.modify`. Emits `forms.widgetsReordered`.
   */
  reorderWidgets(
    widgets: AnnotationRef[],
    position: AnnotationPosition,
    options?: WriteOptions,
  ): AbortablePromise<FormWidgetsReorderResult>;

  /**
   * Make the engine's read-time reconciliation durable in the document
   * ("form doctor"): bootstrap a missing /AcroForm, link recovered field
   * roots into /Fields, re-attach stray widgets to their parent's /Kids,
   * and optionally bake appearances. Validate-then-apply and idempotent —
   * a second call reports zero fixes. Emits `forms.repaired`.
   */
  repair(options?: FormRepairOptions): AbortablePromise<FormRepairResult>;
}
