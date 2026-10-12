import type { WidgetAnnotation } from '../annotation/kinds/widget';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import type { FormFieldDTO } from '../forms/field';
import type { FormSnapshot } from '../forms/snapshot';
import { annotationKey } from '../identity/annotationKey';
import { encodeFieldRefKey, type FormFieldRef } from '../identity/FormFieldRef';
import { encodePageKey, type PageRef } from '../identity/PageRef';
import type { Coordinates } from '../pageSpace/coordinates';

/** Which fields an export takes, each whole. Without `fields` or `pages`, every field. */
export interface FormExportSelection {
  readonly fields?: readonly FormFieldRef[];
  /** Every field with a widget on one of these pages, with all of its widgets. */
  readonly pages?: readonly PageRef[];
}

/** What an export of a form takes: its rows, before the page table and resources. */
export interface FormExportRows<C extends Coordinates> {
  readonly fields: FormFieldDTO<C>[];
  readonly widgets: WidgetAnnotation<C>[];
  readonly calculationOrder: FormFieldRef[];
}

/**
 * The rows an export of `snapshot` takes for `selection`, in the form's
 * order: whole fields, each with every widget it has, whatever page they're
 * on; the fields' widget rows, in their fields' order; and the calculation
 * order among them. A field the form doesn't export (`noExport`) goes
 * without its value and who filled it, a signature field unsigned. `pages`
 * is the document's pages; a selected field or page the document doesn't
 * have is refused with `NotFound`.
 */
export function formExportRowsOf<C extends Coordinates>(
  snapshot: FormSnapshot<C>,
  selection: FormExportSelection,
  pages: readonly PageRef[],
): FormExportRows<C> {
  const chosen = new Set<FormFieldDTO<C>>();
  for (const ref of selection.fields ?? []) {
    const field = snapshot.fields.find((candidate) => fieldMatches(candidate, ref));
    if (!field) {
      throw new EngineError(
        EngineErrorCode.NotFound,
        `export: the form has no field ${ref.kind === 'fqn' ? ref.name : encodeFieldRefKey(ref)}`,
      );
    }
    chosen.add(field);
  }
  const inDocument = new Set(pages.map(encodePageKey));
  const selectedPages = new Set<string>();
  for (const page of selection.pages ?? []) {
    if (!inDocument.has(encodePageKey(page))) {
      throw new EngineError(
        EngineErrorCode.NotFound,
        `export: the document has no page ${encodePageKey(page)}`,
      );
    }
    selectedPages.add(encodePageKey(page));
  }
  for (const field of snapshot.fields) {
    if (
      field.widgets.some((widget) => widget.page && selectedPages.has(encodePageKey(widget.page)))
    ) {
      chosen.add(field);
    }
  }
  const everyField = !selection.fields && !selection.pages;
  const fields = snapshot.fields.filter((field) => everyField || chosen.has(field));

  const rowByKey = new Map(snapshot.widgets.map((row) => [annotationKey(row.ref), row]));
  const widgets = fields.flatMap((field) =>
    field.widgets.flatMap((widget) => {
      const row = widget.ref ? rowByKey.get(annotationKey(widget.ref)) : undefined;
      return row ? [row] : [];
    }),
  );
  const exported = new Set(fields.map((field) => encodeFieldRefKey(field.ref)));
  const calculationOrder = snapshot.calculationOrder.filter(
    (ref): ref is FormFieldRef => ref !== null && exported.has(encodeFieldRefKey(ref)),
  );
  return { fields: fields.map(exportedField), widgets, calculationOrder };
}

/** Whether `field` is the one `ref` names, by its object number or its full name. */
export function fieldMatches(
  field: { ref: FormFieldRef; name: string },
  ref: FormFieldRef,
): boolean {
  return ref.kind === 'fqn'
    ? field.name === ref.name
    : field.ref.kind === 'objectNumber' && field.ref.objectNumber === ref.objectNumber;
}

/**
 * A field as an export carries it: one the form doesn't export without its
 * value and who filled it, and a signature field without its signature.
 */
function exportedField<C extends Coordinates>(field: FormFieldDTO<C>): FormFieldDTO<C> {
  if (field.family === 'signature') return { ...field, valueEntry: { kind: 'none' } };
  if (!field.noExport) return field;
  const unfilled = {
    ...field,
    valueEntry: { kind: 'none' },
    filledBy: null,
    filledByName: null,
    filledAt: null,
  } as const;
  switch (field.family) {
    case 'text':
    case 'combobox':
      return { ...unfilled, family: field.family, value: '' } as FormFieldDTO<C>;
    case 'checkbox':
      return {
        ...unfilled,
        family: 'checkbox',
        checked: false,
        widgets: field.widgets.map((widget) => ({ ...widget, checked: false })),
      } as FormFieldDTO<C>;
    case 'radio':
      return {
        ...unfilled,
        family: 'radio',
        value: 'Off',
        widgets: field.widgets.map((widget) => ({ ...widget, checked: false })),
      } as FormFieldDTO<C>;
    case 'listbox':
      return {
        ...unfilled,
        family: 'listbox',
        selectedValues: [],
        options: field.options.map((option) => ({ ...option, selected: false })),
      } as FormFieldDTO<C>;
    default:
      return unfilled as FormFieldDTO<C>;
  }
}
