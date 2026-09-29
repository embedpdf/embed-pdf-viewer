import type { FormFieldDTO, FormSnapshot, FormValueEntry } from '@embedpdf/engine-core/runtime';

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

/** Build the VM's detached field view from the engine's lossless snapshot. */
export function scriptFieldsFromSnapshot(snapshot: FormSnapshot): ScriptFieldInput[] {
  return snapshot.fields.map((field: FormFieldDTO) => ({
    ref: field.ref,
    name: field.name,
    family: field.family,
    value: fieldValueFromEntry(field, field.valueEntry),
    defaultValue: fieldValueFromEntry(field, field.defaultValueEntry),
    // Form DTOs do not yet aggregate widget visibility; annotation joins may
    // override this when the orchestrator has that plane loaded.
    display: 'visible',
    readOnly: field.flags.readOnly,
    required: field.flags.required,
    ...('options' in field
      ? { options: field.options.map((option) => ({ label: option.label, value: option.value })) }
      : {}),
    ...(field.family === 'checkbox' || field.family === 'radio'
      ? { exportValues: field.widgets.map((widget) => widget.exportValue) }
      : {}),
  }));
}
