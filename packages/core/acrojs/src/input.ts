import type {
  FormFieldDisplay,
  FormFieldDTO,
  FormSnapshot,
  FormValueEntry,
  WidgetAnnotation,
} from '@embedpdf/engine-core/runtime';

import type { ScriptFieldInput, ScriptValue } from './types';

function valueFromEntry(entry: FormValueEntry): ScriptValue {
  switch (entry.kind) {
    case 'scalar':
      return entry.value;
    case 'array':
      return [...entry.values];
    case 'none':
    case 'unsupported':
      return null;
  }
}

/**
 * A field value as scripts see it. A checkbox or radio group shows the export
 * value of its checked widget, as Acrobat's `field.value` does, or `'Off'`.
 */
function fieldValueFromEntry(field: FormFieldDTO, entry: FormValueEntry): ScriptValue {
  if (field.family !== 'checkbox' && field.family !== 'radio') return valueFromEntry(entry);
  if (entry.kind !== 'scalar') return 'Off';
  const checked = field.widgets.find((widget) => widget.onState === entry.value);
  return checked?.exportValue ?? entry.value;
}

/**
 * How a widget shows, as Acrobat's `field.display` reads its flags: hidden;
 * on screen but not printed; printed but not on screen; or visible.
 */
function displayOf(row: WidgetAnnotation | undefined): FormFieldDisplay {
  if (!row) return 'visible';
  if (row.hidden) return 'hidden';
  if (row.noView) return 'noView';
  return row.print ? 'visible' : 'noPrint';
}

/** Build the VM's detached field view from the engine's lossless snapshot. */
export function scriptFieldsFromSnapshot(snapshot: FormSnapshot): ScriptFieldInput[] {
  const rows = new Map(
    snapshot.widgets.map((row) => [
      row.ref.kind === 'objectNumber' ? row.ref.objectNumber : 0,
      row,
    ]),
  );
  return snapshot.fields.map((field: FormFieldDTO) => ({
    ref: field.ref,
    name: field.name,
    family: field.family,
    value: fieldValueFromEntry(field, field.valueEntry),
    defaultValue: fieldValueFromEntry(field, field.defaultValueEntry),
    // A field shows as its first widget does.
    display: displayOf(rows.get(field.widgets?.[0]?.objectNumber ?? -1)),
    readOnly: field.readOnly,
    required: field.required,
    ...('options' in field
      ? { options: field.options.map((option) => ({ label: option.label, value: option.value })) }
      : {}),
    ...(field.family === 'checkbox' || field.family === 'radio'
      ? { exportValues: field.widgets.map((widget) => widget.exportValue) }
      : {}),
  }));
}
