import type { BundleImportPages } from './bundle';
import type { FormBundle } from './FormBundle';
import type { WidgetAnnotation, WidgetPatch } from '../annotation/kinds/widget';
import type { FormFieldDTO } from '../forms/field';
import type { AnnotationRef } from '../identity/AnnotationRef';
import type { FormFieldRef } from '../identity/FormFieldRef';
import {
  formResetFacts,
  type FormFieldCreateResult,
  type FormMutationMeta,
  type FormSetValueResult,
} from '../mutation/FormMutationResults';
import type { WriteOptions } from '../mutation/WriteOptions';
import type { Coordinates, PageCoordinates } from '../pageSpace/coordinates';

/**
 * How to import a form's design (`doc.forms.import`). The `opId` names the
 * import: its events share it as `origin.tx.id`, `doc.apply({ undoOf })`
 * undoes it, and a retry with the same id applies once.
 */
export interface FormImportOptions extends WriteOptions {
  /** Default `'same'`. A page a widget is on or points at that maps nowhere refuses the import. */
  readonly pages?: BundleImportPages;
  /**
   * `'restore'` (the default) writes who created and filled each field as
   * the bundle has them, and the session as `importedBy`; it needs
   * `doc.forms.import`. `'stamp'` makes the fields the session's, as
   * `create` does.
   */
  readonly attribution?: 'restore' | 'stamp';
  /** Whether each field gets the value the bundle holds. Default `true`. */
  readonly values?: boolean;
}

/**
 * How to fill a form again from a bundle (`doc.forms.importValues`): each
 * field the bundle holds a value for, by its full name.
 */
export interface FormValuesImportOptions extends WriteOptions {
  /**
   * `'restore'` (the default) writes who filled each field as the bundle
   * has it, and needs `doc.forms.import`; `'stamp'` makes the session the
   * filler, as `setValue` does.
   */
  readonly attribution?: 'restore' | 'stamp';
}

/**
 * An import as it travels to a server: the bundle without its bytes (each
 * resource is a part of its own) and the options, apart from the `opId`,
 * which is the request's `Idempotency-Key`.
 */
export interface FormImportBody {
  readonly bundle: Omit<FormBundle, 'resources'>;
  readonly options: Omit<FormImportOptions, 'opId'>;
}

/** A values import as it travels to a server (see {@link FormImportBody}). */
export interface FormValuesImportBody {
  readonly bundle: Omit<FormBundle, 'resources'>;
  readonly options: Omit<FormValuesImportOptions, 'opId'>;
}

/** Why a design import left a field, a widget, or one of their actions out. */
export type FormImportDropReason =
  /** Its full name is a field's of the document already, or an earlier one's of the bundle. */
  | 'name-conflict'
  /** A widget whose field isn't in the bundle. */
  | 'no-field'
  /** A field of a family the engine doesn't model (`family: 'unknown'`). */
  | 'unsupported-family'
  /** A script, submit or link, and the session lacks `doc.forms.script`. */
  | 'script-not-allowed'
  /** Actions a write can't make, or that were read incomplete. */
  | 'unsupported-action';

export interface FormImportDrop {
  /** The field, as the bundle names it; for a widget in no field of the bundle, the field it names. */
  readonly ref: FormFieldRef | null;
  /** Set when a widget, or one of its actions, was left out. */
  readonly widget?: AnnotationRef;
  /** Set when only this member was left out, as `actions.calculate`: the rest was imported. */
  readonly field?: string;
  readonly reason: FormImportDropReason;
}

/** Why a values import left a field's value out. */
export type FormValuesImportDropReason =
  /** The document has no field of that full name. */
  | 'no-field'
  /** The document's field of that name is of another family. */
  | 'wrong-family'
  /** The field can't take the value: an option it doesn't have, a button it lacks. */
  | 'value-not-allowed'
  /** A signature locked the field. */
  | 'locked'
  /** The session may not fill the field in: its group is one the session's scopes don't reach. */
  | 'fill-not-allowed';

export interface FormValuesImportDrop {
  /** The field, as the bundle names it. */
  readonly ref: FormFieldRef;
  readonly reason: FormValuesImportDropReason;
}

export interface FormImportResult<C extends Coordinates = PageCoordinates> {
  /** The fields the import made, in bundle order, each as it is now. */
  fields: FormFieldDTO<C>[];
  /** Their widgets' rows. */
  widgets: WidgetAnnotation<C>[];
  /** Each imported field's ref in the bundle, and its ref in this document. */
  refMap: Array<{ from: FormFieldRef; to: FormFieldRef }>;
  /** What was left out, in bundle order. */
  dropped: FormImportDrop[];
  /** The form's whole calculation order, when the import changed it. */
  calculationOrder?: FormFieldRef[];
  meta: FormMutationMeta;
}

export interface FormValuesImportResult<C extends Coordinates = PageCoordinates> {
  /** The fields whose value changed, in bundle order, each as it is now. */
  fields: FormFieldDTO<C>[];
  /** The rows of the widgets whose look changed. */
  widgets: WidgetAnnotation<C>[];
  /** What was left out, in bundle order. */
  dropped: FormValuesImportDrop[];
  meta: FormMutationMeta;
}

/** The flags a widget row has, which a copy keeps. */
export const WIDGET_FLAG_NAMES = [
  'invisible',
  'hidden',
  'print',
  'noZoom',
  'noRotate',
  'noView',
  'readOnly',
  'locked',
  'toggleNoView',
  'lockedContents',
] as const;

/** A widget's flags, as its row has them. */
export type WidgetFlags = Pick<WidgetPatch, (typeof WIDGET_FLAG_NAMES)[number]>;

/**
 * The facts a design import committed: one `forms.created` per field, in
 * bundle order, each with its own widgets and the part of the meta that is
 * its own. The calculation order, when the import changed it, rides on the
 * last.
 */
export function formImportFacts<C extends Coordinates>(
  result: FormImportResult<C>,
): FormFieldCreateResult<C>[] {
  const last = result.fields.length - 1;
  return result.fields.map((field, index) => {
    const own = new Set(field.widgets.map((widget) => widget.objectNumber));
    const widgets = result.widgets.filter(
      (row) => row.ref.kind === 'objectNumber' && own.has(row.ref.objectNumber),
    );
    const changedWidgets = result.meta.changedWidgets.filter((widget) =>
      own.has(widget.objectNumber),
    );
    const pages = new Set(
      changedWidgets.flatMap((widget) => (widget.page ? [widget.page.objectNumber] : [])),
    );
    return {
      field,
      widgets,
      ...(index === last && result.calculationOrder
        ? { calculationOrder: result.calculationOrder }
        : {}),
      meta: {
        affectedPages: result.meta.affectedPages.filter((page) => pages.has(page.objectNumber)),
        cacheDelta: index === last ? result.meta.cacheDelta : null,
        opId: result.meta.opId,
        undoable: result.meta.undoable,
        changedFields: [field.ref],
        changedWidgets,
        redrawnWidgets: result.meta.redrawnWidgets.filter((widget) => own.has(widget.objectNumber)),
      },
    };
  });
}

/** The facts a values import committed: one `forms.valueSet` per field it filled, as a reset's. */
export function formValuesImportFacts<C extends Coordinates>(
  result: FormValuesImportResult<C>,
): FormSetValueResult<C>[] {
  return formResetFacts(result);
}
