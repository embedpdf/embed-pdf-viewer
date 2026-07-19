import type {
  FormFieldDTO,
  FormFieldFamily,
  FormSnapshot,
  FormValueEntry,
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

function fieldValueFromEntry(family: FormFieldFamily, entry: FormValueEntry): ScriptValue {
  if ((family === 'checkbox' || family === 'radio') && entry.kind === 'none') return 'Off';
  return valueFromEntry(entry);
}

/** Build the VM's detached field view from the engine's lossless snapshot. */
export function scriptFieldsFromSnapshot(snapshot: FormSnapshot): ScriptFieldInput[] {
  return snapshot.fields.map((field: FormFieldDTO) => ({
    ref: field.ref,
    name: field.name,
    family: field.family,
    value: fieldValueFromEntry(field.family, field.valueEntry),
    defaultValue: fieldValueFromEntry(field.family, field.defaultValueEntry),
    // Form DTOs do not yet aggregate widget visibility; annotation joins may
    // override this when the orchestrator has that plane loaded.
    display: 'visible',
    readOnly: field.flags.readOnly,
    required: field.flags.required,
    ...('options' in field
      ? { options: field.options.map((option) => ({ label: option.label, value: option.value })) }
      : {}),
  }));
}
