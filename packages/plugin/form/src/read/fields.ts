/**
 * Reads over the mirrored field tree: fields, values, the joins between a
 * field and its widgets' rows, the field of the selected widget, and the
 * required-field check.
 */
import { memo, memoByKey } from '@embedpdf/core';
import {
  pageRefsEqual,
  type FormFieldDTO,
  type FormFieldValue,
  type FormKind,
  type WidgetAnnotation,
} from '@embedpdf/engine-core/runtime';

import type {
  FormCapability,
  FormFilter,
  FormPlainValue,
  FormValidation,
  WidgetAddress,
} from '../contract';
import { canonicalKey, fieldByKey, fieldByRef, fieldForWidget, widgetRowOf } from '../model';
import type { FormContext, FormServices } from '../services';

const NO_FIELDS: readonly FormFieldDTO[] = Object.freeze([]);
const NOTHING_SELECTED: readonly { readonly subtype: string; readonly ref: WidgetAddress }[] =
  Object.freeze([]);

/** A widget address as the annotation object number the field index is keyed by. */
export const widgetObjectOf = (widget: WidgetAddress): number =>
  'kind' in widget
    ? widget.kind === 'objectNumber'
      ? widget.objectNumber
      : 0
    : widget.objectNumber;

/** A field's value in the write vocabulary, or null for a valueless or unsupported entry. */
export function valueOf(field: FormFieldDTO): FormFieldValue | null {
  const entry = field.valueEntry;
  if (entry.kind === 'none' || entry.kind === 'unsupported') return null;
  switch (field.family) {
    case 'text':
      return { value: field.value };
    case 'checkbox':
      return { checked: field.checked };
    case 'radio':
      return { value: field.value === 'Off' ? null : field.value };
    case 'combobox':
      return { value: field.value === '' ? null : field.value };
    case 'listbox':
      return { selectedValues: [...field.selectedValues] };
    default:
      return null;
  }
}

/** A field's value as plain data: what `exportValues()` gives and `importValues()` takes. */
export function plainValueOf(field: FormFieldDTO): FormPlainValue | undefined {
  const value = valueOf(field);
  if (!value) return undefined;
  if ('checked' in value) return value.checked;
  if ('selectedValues' in value) return value.selectedValues;
  return value.value;
}

/**
 * The write a plain value makes for a field of this family, or null when the
 * family can't take it (a list given `true`, a value for a push button).
 */
export function writeOfPlainValue(
  field: FormFieldDTO,
  value: FormPlainValue,
): FormFieldValue | null {
  switch (field.family) {
    case 'checkbox':
      if (typeof value === 'boolean') return { checked: value };
      return typeof value === 'string' || value === null ? { value } : null;
    case 'text':
    case 'radio':
    case 'combobox':
      return typeof value === 'string' || value === null ? { value } : null;
    case 'listbox':
      if (value === null) return { selectedValues: [] };
      if (typeof value === 'string') return { selectedValues: [value] };
      return Array.isArray(value) ? { selectedValues: [...value] } : null;
    default:
      return null;
  }
}

/** Whether a field holds nothing a required check would accept. */
function isEmpty(field: FormFieldDTO): boolean {
  switch (field.family) {
    case 'text':
    case 'combobox':
      return field.value === '';
    case 'checkbox':
      return !field.checked;
    case 'radio':
      return field.value === 'Off' || field.value === '';
    case 'listbox':
      return field.selectedValues.length === 0;
    case 'signature':
      return field.valueEntry.kind === 'none';
    default:
      return false;
  }
}

export function createFieldReads(
  ctx: FormContext,
  { fields, siblings }: Pick<FormServices, 'fields' | 'siblings'>,
) {
  const all = (): readonly FormFieldDTO[] => fields.get().snapshot?.fields ?? NO_FIELDS;

  const list = (filter?: FormFilter): readonly FormFieldDTO[] => {
    if (!filter) return all();
    const page = filter.page === undefined ? undefined : ctx.getPage(filter.page)?.ref;
    // A page that isn't in the document has no fields.
    if (filter.page !== undefined && !page) return NO_FIELDS;
    return all().filter(
      (field) =>
        (!filter.family || field.family === filter.family) &&
        (filter.name === undefined || field.name === filter.name) &&
        (!page || field.widgets.some((widget) => widget.page && pageRefsEqual(widget.page, page))),
    );
  };

  // One value object per field while the field stays the same, so a reader
  // that compares by reference re-renders only when this field changes.
  const valueByKey = memoByKey(
    (key: string) => [fieldByKey(fields.get(), key)],
    (_key, field): FormFieldValue | null => (field ? valueOf(field) : null),
    { maxEntries: 1024 },
  );

  // One array per field while its widgets' rows stay the same objects.
  const widgetsByKey = memoByKey(
    (key: string) => {
      const index = fields.get();
      const field = fieldByKey(index, key);
      return (field?.widgets ?? []).map((widget) => widgetRowOf(index, widget.objectNumber));
    },
    (_key, ...rows): readonly WidgetAnnotation[] =>
      Object.freeze(rows.filter((row): row is WidgetAnnotation => row !== null)),
    { maxEntries: 1024 },
  );

  const exportValues = memo(
    () => [fields.get()],
    (index): Readonly<Record<string, FormPlainValue>> => {
      const values: Record<string, FormPlainValue> = {};
      for (const field of index.snapshot?.fields ?? []) {
        const value = plainValueOf(field);
        if (value !== undefined) values[field.name] = value;
      }
      return values;
    },
  );

  /** Where a field first shows: its page's index, then top to bottom, then left to right. */
  const placeOf = (field: FormFieldDTO): readonly [number, number, number] => {
    const index = fields.get();
    const row = field.widgets
      .map((widget) => widgetRowOf(index, widget.objectNumber))
      .find((candidate) => candidate !== null);
    const page = row ? (ctx.getPage(row.page)?.index ?? Infinity) : Infinity;
    return [page, row?.rect.y ?? 0, row?.rect.x ?? 0];
  };

  // The page order is an input too: moving a page moves its fields in the list.
  const validate = memo(
    () => [fields.get(), ctx.document()],
    (index): FormValidation => {
      const missing = (index.snapshot?.fields ?? [])
        .filter((field) => field.required && isEmpty(field))
        .map((field) => ({ field, place: placeOf(field) }))
        .sort(
          (left, right) =>
            left.place[0] - right.place[0] ||
            left.place[1] - right.place[1] ||
            left.place[2] - right.place[2],
        )
        .map(({ field }) => field);
      return { valid: missing.length === 0, missing };
    },
  );

  // The selection belongs to the annotation plugin: a widget is selected in
  // design mode, where widgets are boxes like any annotation.
  const getSelectedField = memo(
    () => [fields.get(), siblings.annotation?.selection.list() ?? NOTHING_SELECTED],
    (index, selected): FormFieldDTO | null => {
      const [annotation] = selected;
      if (selected.length !== 1 || !annotation?.subtype.startsWith('widget')) return null;
      return fieldForWidget(index, widgetObjectOf(annotation.ref));
    },
  );

  return {
    api: {
      getSnapshot: () => fields.get().snapshot,
      getStatus: fields.getStatus,
      getFormKind: (): FormKind => fields.get().snapshot?.formKind ?? 'none',
      refresh: (options) => ctx.cancellable(options?.signal, fields.refresh()),
      get: (ref) => fieldByRef(fields.get(), ref),
      getFieldForWidget: (widget) => fieldForWidget(fields.get(), widgetObjectOf(widget)),
      getWidget: (widget) => widgetRowOf(fields.get(), widgetObjectOf(widget)),
      getWidgets: (ref) => widgetsByKey(canonicalKey(fields.get(), ref)),
      list,
      getValue: (ref) => valueByKey(canonicalKey(fields.get(), ref)),
      getSelectedField,
      validate,
      exportValues,
    } satisfies Partial<FormCapability>,
  };
}
