import type { MutationMeta } from './MutationMeta';
import type { AppearanceOutcome } from '../annotation/appearance';
import type { WidgetAnnotation } from '../annotation/kinds/widget';
import type { FormFieldDTO } from '../forms/field';
import type { FormSnapshot } from '../forms/snapshot';
import type { AnnotationRef } from '../identity/AnnotationRef';
import type { FormFieldRef, FormWidget } from '../identity/FormFieldRef';
import type { PageRef } from '../identity/PageRef';
import type { Coordinates, PageCoordinates } from '../pageSpace/coordinates';

/**
 * A single-field write's meta: the page envelope plus what changed — the
 * field (for a delete, the field that went) and every widget whose look
 * changed or that went with it. A field's widgets can live on several
 * pages, so use `changedWidgets` to invalidate page renders and appearance
 * caches. An idempotent write (the same value again) lists no widgets.
 */
export interface FormMutationMeta extends MutationMeta {
  /** The fields written, by object number. */
  changedFields: FormFieldRef[];
  changedWidgets: FormWidget[];
}

/**
 * The widget rows a form write changed, read back after it: each widget of
 * `meta.changedWidgets` that is still on a page, as `doc.forms.list()` shows
 * it. A form's mirror folds them without a read.
 */
export interface FormWidgetRows<C extends Coordinates = PageCoordinates> {
  widgets: WidgetAnnotation<C>[];
}

/** Result of a value write (`setValue` / `reset`): the field read back after the write. */
export interface FormSetValueResult<
  C extends Coordinates = PageCoordinates,
> extends FormWidgetRows<C> {
  field: FormFieldDTO<C>;
  meta: FormMutationMeta;
}

/**
 * Result of `reset`: the fields that changed, read back, and one meta for
 * all of them. An empty `fields` means every field was already at its
 * default.
 */
export interface FormResetResult<
  C extends Coordinates = PageCoordinates,
> extends FormWidgetRows<C> {
  fields: FormFieldDTO<C>[];
  meta: FormMutationMeta;
}

/**
 * A reset as one value write per changed field: each field with the part of
 * the meta that is its own. A reset's `forms.valueSet` events carry these.
 */
export function formResetFacts<C extends Coordinates>(
  result: FormResetResult<C>,
): FormSetValueResult<C>[] {
  return result.fields.map((field) => {
    const own = new Set(field.widgets.map((widget) => widget.objectNumber));
    const changedWidgets = result.meta.changedWidgets.filter((widget) =>
      own.has(widget.objectNumber),
    );
    const widgets = result.widgets.filter(
      (widget) => widget.ref.kind === 'objectNumber' && own.has(widget.ref.objectNumber),
    );
    const pages = new Set(
      changedWidgets.flatMap((widget) => (widget.page ? [widget.page.objectNumber] : [])),
    );
    return {
      field,
      widgets,
      meta: {
        affectedPages: result.meta.affectedPages.filter((page) => pages.has(page.objectNumber)),
        cacheDelta: null,
        opId: result.meta.opId,
        undoable: result.meta.undoable,
        changedFields: [field.ref],
        changedWidgets,
      },
    };
  });
}

/**
 * Result of applying an FDF/XFDF payload. Import is per-field: one bad
 * entry (unknown name, family mismatch, failed validation) is counted in
 * `skipped` and never poisons the rest.
 */
export interface FormImportResult<C extends Coordinates = PageCoordinates> {
  /** The complete form after the import — no second round trip. */
  form: FormSnapshot<C>;
  /** Fields filled. */
  applied: number;
  /** Fields left out: unknown, the wrong kind, a value they can't take, or locked. */
  skipped: number;
  meta: MutationMeta;
}

/** Serialized form data produced by `export`. */
export interface FormDataExport {
  format: 'fdf' | 'xfdf';
  bytes: Uint8Array;
}

/** Result of `create`: the field read back, and its widget rows. */
export interface FormFieldCreateResult<
  C extends Coordinates = PageCoordinates,
> extends FormWidgetRows<C> {
  field: FormFieldDTO<C>;
  meta: FormMutationMeta;
}

/** Result of `update` and `setSignatureAppearance`. */
export interface FormFieldUpdateResult<
  C extends Coordinates = PageCoordinates,
> extends FormWidgetRows<C> {
  field: FormFieldDTO<C>;
  meta: FormMutationMeta;
}

/**
 * Result of `updateWidget`: the widget read back after the patch, and the
 * engine's appearance verdict (see `AnnotationUpdateResult.appearance`).
 */
export interface FormWidgetUpdateResult<C extends Coordinates = PageCoordinates> {
  widget: WidgetAnnotation<C>;
  appearance: AppearanceOutcome;
  meta: FormMutationMeta;
}

/**
 * Result of `reorderWidgets`: the page's widgets in their new paint order,
 * whole, as refs. Widgets paint above every annotation, in this order.
 */
export interface FormWidgetsReorderResult {
  page: PageRef;
  /** Every widget of the page, bottom to top. */
  order: AnnotationRef[];
  /** `meta.changedWidgets` names the widgets that moved, in the order given. */
  meta: FormMutationMeta;
}

/**
 * Result of `delete`: nothing exists after it, so only `meta`. The field's
 * widgets are deleted from their pages as part of the cascade; `meta` names
 * the field and lists them, so caches can invalidate.
 */
export interface FormFieldDeleteResult {
  meta: FormMutationMeta;
}

/** What a delete removed, as its event names it: the field in `meta.changedFields`. */
export function deletedFieldOf(result: FormFieldDeleteResult): FormFieldRef | null {
  return result.meta.changedFields[0] ?? null;
}

/**
 * Result of `addWidget` / `removeWidget`: the field read back, and the
 * widget's row (a removed widget stays on its page, in no field).
 */
export interface FormWidgetLinkResult<
  C extends Coordinates = PageCoordinates,
> extends FormWidgetRows<C> {
  field: FormFieldDTO<C>;
  meta: FormMutationMeta;
}

/**
 * Result of `deleteWidget`: the widget is gone from its page, and from its
 * field when it had one. `field` is that field read back, `null` for a widget
 * in no field.
 */
export interface FormWidgetDeleteResult<C extends Coordinates = PageCoordinates> {
  widget: AnnotationRef;
  page: PageRef;
  field: FormFieldDTO<C> | null;
  meta: FormMutationMeta;
}

/**
 * What an undo of `deleteWidget` answers: the widget's row, back on its page
 * at its place, and its field with it again (`null` for a widget in no field).
 */
export interface FormWidgetRestoreResult<
  C extends Coordinates = PageCoordinates,
> extends FormWidgetRows<C> {
  field: FormFieldDTO<C> | null;
  meta: FormMutationMeta;
}

/**
 * Result of a repair pass. Repair is validate-then-apply and idempotent:
 * when there is nothing to fix, every counter is zero and the document is
 * untouched.
 */
export interface FormRepairResult {
  /** A missing /AcroForm dictionary was created (with /DR and /DA). */
  acroformCreated: boolean;
  /** Recovered field roots appended to /AcroForm /Fields. */
  fieldsLinked: number;
  /** Stray widgets appended to their parent field's /Kids. */
  widgetsLinked: number;
  /** Direct-object fields that cannot be referenced and stay recovered. */
  fieldsUnrepairable: number;
  /** Widgets whose appearance stream was (re)generated. */
  appearancesBaked: number;
  /** /NeedAppearances was cleared after re-baking. */
  needsAppearancesCleared: boolean;
  meta: MutationMeta;
}
