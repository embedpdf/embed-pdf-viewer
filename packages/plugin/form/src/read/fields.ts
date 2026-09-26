/** Reads over the mirrored field tree: fields, values, and the widget → field join. */
import {
  pageRefsEqual,
  type FormFieldDTO,
  type FormFieldValue,
} from '@embedpdf/engine-core/runtime';

import type { FormCapability, FormFilter, WidgetAddress } from '../contract';
import { fieldByKey, fieldForWidget } from '../model';
import type { FormServices } from '../services';

/** A widget address as the annotation object number the field index is keyed by. */
export const widgetObjectOf = (widget: WidgetAddress): number =>
  'kind' in widget
    ? widget.kind === 'objectNumber'
      ? widget.annotObjectNumber
      : 0
    : widget.annotObjectNumber;

/** A field's value in the write vocabulary, or null for a valueless or unsupported entry. */
export function valueOf(field: FormFieldDTO): FormFieldValue | null {
  const entry = field.valueEntry;
  if (entry.kind === 'none' || entry.kind === 'unsupported') return null;
  if (field.family === 'checkbox' || field.family === 'radio') {
    return {
      type: 'toggle',
      state: entry.kind === 'scalar' ? entry.value : (entry.values[0] ?? null),
    };
  }
  if (field.family === 'combobox' || field.family === 'listbox') {
    return { type: 'choice', values: entry.kind === 'scalar' ? [entry.value] : [...entry.values] };
  }
  return { type: 'text', value: entry.kind === 'scalar' ? entry.value : entry.values.join('\n') };
}

export function createFieldReads({ fields, keyOf }: Pick<FormServices, 'fields' | 'keyOf'>) {
  const listFields = (filter?: FormFilter): readonly FormFieldDTO[] => {
    const all = fields.get().snapshot?.fields ?? [];
    if (!filter) return all;
    const page = filter.page;
    return all.filter(
      (field) =>
        (!filter.family || field.family === filter.family) &&
        (filter.name === undefined || field.name === filter.name) &&
        (!page || field.widgets.some((widget) => widget.page && pageRefsEqual(widget.page, page))),
    );
  };

  const exportValues = (): Readonly<Record<string, FormFieldValue>> => {
    const values: Record<string, FormFieldValue> = {};
    for (const field of fields.get().snapshot?.fields ?? []) {
      const value = valueOf(field);
      if (value) values[field.name] = value;
    }
    return values;
  };

  return {
    api: {
      getSnapshot: () => fields.get().snapshot,
      getStatus: fields.getStatus,
      refresh: () => fields.refresh(),
      getField: (ref) => fieldByKey(fields.get(), keyOf(ref)),
      getFieldForWidget: (widget) => fieldForWidget(fields.get(), widgetObjectOf(widget)),
      listFields,
      getValue: (ref) => {
        const field = fieldByKey(fields.get(), keyOf(ref));
        return field ? valueOf(field) : null;
      },
      exportValues,
    } satisfies Partial<FormCapability>,
  };
}
