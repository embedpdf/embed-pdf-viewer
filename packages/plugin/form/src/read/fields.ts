/** Reads over the reconciled snapshot: fields, values, the widget → field map. */
import {
  pageRefsEqual,
  type FormFieldDTO,
  type FormFieldValue,
} from '@embedpdf/engine-core/runtime';

import type { FormCapability, FormFilter, WidgetAddress } from '../contract';
import { fieldByKey, fieldForWidget as coreFieldForWidget } from '../core/model';
import type { FormServices } from '../services';

export function createFieldReads({ store }: Pick<FormServices, 'store'>) {
  const { model, keyOf } = store;
  const widgetObjectOf = (widget: WidgetAddress): number =>
    'kind' in widget
      ? widget.kind === 'objectNumber'
        ? widget.annotObjectNumber
        : 0
      : widget.annotObjectNumber;
  const listFields = (filter?: FormFilter): readonly FormFieldDTO[] => {
    const fields = model().snapshot?.fields ?? [];
    if (!filter) return fields;
    const page = filter.page;
    return fields.filter(
      (f) =>
        (!filter.family || f.family === filter.family) &&
        (filter.name === undefined || f.name === filter.name) &&
        (!page || f.widgets.some((w) => w.page && pageRefsEqual(w.page, page))),
    );
  };
  const valueOf = (field: FormFieldDTO): FormFieldValue | null => {
    const entry = field.valueEntry;
    if (entry.kind === 'none' || entry.kind === 'unsupported') return null;
    if (field.family === 'checkbox' || field.family === 'radio') {
      return {
        type: 'toggle',
        state: entry.kind === 'scalar' ? entry.value : (entry.values[0] ?? null),
      };
    }
    if (field.family === 'combobox' || field.family === 'listbox') {
      return {
        type: 'choice',
        values: entry.kind === 'scalar' ? [entry.value] : [...entry.values],
      };
    }
    return {
      type: 'text',
      value: entry.kind === 'scalar' ? entry.value : entry.values.join('\n'),
    };
  };
  const exportValues = (): Readonly<Record<string, FormFieldValue>> => {
    const out: Record<string, FormFieldValue> = {};
    for (const field of model().snapshot?.fields ?? []) {
      const value = valueOf(field);
      if (value) out[field.name] = value;
    }
    return out;
  };
  return {
    widgetObjectOf,
    api: {
      getSnapshot: () => model().snapshot,
      getField: (ref) => fieldByKey(model(), keyOf(ref)),
      getFieldForWidget: (widget) => coreFieldForWidget(model(), widgetObjectOf(widget)),
      listFields,
      getValue: (ref) => {
        const field = fieldByKey(model(), keyOf(ref));
        return field ? valueOf(field) : null;
      },
      exportValues,
    } satisfies Partial<FormCapability>,
  };
}
