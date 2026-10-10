/**
 * What a value write is, worked out from the field it writes: the one place
 * the engine checks a value against its field, shared by the engine (before
 * it writes) and a viewer (before it shows the write, `predict.ts`).
 */
import type { FormFieldDTO, FormFieldFamily } from './field';
import type { FormFieldValue } from './value';
import type { FormValueEntry } from './value-entry';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import type { Coordinates } from '../pageSpace/coordinates';

/**
 * A value write, as the field's family takes it: a text field's text, a
 * toggle's on-state (`null` clears the group), or a choice field's option
 * values (free text for a dropdown that allows editing).
 */
export type FieldValueWrite =
  | { kind: 'text'; value: string }
  | { kind: 'toggle'; state: string | null }
  | { kind: 'choice'; values: string[] };

/** The shapes each family takes, for the message when a value doesn't fit. */
const TAKES: Partial<Record<FormFieldFamily, string>> = {
  text: '{ value }',
  checkbox: '{ checked } or { value }',
  radio: '{ value }',
  combobox: '{ value }',
  listbox: '{ selectedValues }',
};

/**
 * The write `value` makes for `field`, checked before anything is written:
 * the shape must be one the family takes, a toggle's value must be the
 * export value of one of its widgets (a radio group that must keep a choice
 * can't be cleared), and a choice must be option values (free text for a
 * dropdown that allows editing). `InvalidArg` otherwise.
 */
export function fieldValueWriteOf(
  field: FormFieldDTO<Coordinates>,
  value: FormFieldValue,
): FieldValueWrite {
  switch (field.family) {
    case 'text':
      if ('value' in value) return { kind: 'text', value: value.value ?? '' };
      break;
    case 'checkbox':
      if ('checked' in value) {
        if (!value.checked) return { kind: 'toggle', state: null };
        const first = field.widgets[0];
        if (!first) throw invalidValue(`'${field.name}' has no widget to check`);
        return { kind: 'toggle', state: first.onState };
      }
      if ('value' in value) return { kind: 'toggle', state: toggleStateOf(field, value.value) };
      break;
    case 'radio':
      if ('value' in value) {
        const state = toggleStateOf(field, value.value);
        if (state === null && field.noToggleToOff) {
          throw invalidValue(`'${field.name}' must keep a choice: it can't be cleared`);
        }
        return { kind: 'toggle', state };
      }
      break;
    case 'combobox':
      if ('value' in value) return choiceOf(field, value.value === null ? [] : [value.value]);
      break;
    case 'listbox':
      if ('selectedValues' in value) return choiceOf(field, value.selectedValues);
      break;
    default:
      throw invalidValue(`${field.family} fields hold no value you can set`);
  }
  throw invalidValue(`a ${field.family} field takes ${TAKES[field.family]}, not ${shapeOf(value)}`);
}

/** Whether `write` would leave `field` as it is. */
export function isNoOpWrite(field: FormFieldDTO<Coordinates>, write: FieldValueWrite): boolean {
  switch (write.kind) {
    case 'text':
      return field.family === 'text' && field.value === write.value;
    case 'toggle':
      return (
        (field.family === 'checkbox' || field.family === 'radio') &&
        field.widgets.every((widget) => widget.checked === (widget.onState === write.state))
      );
    case 'choice':
      if (field.family === 'combobox') {
        return write.values.length === 0 ? field.value === '' : field.value === write.values[0];
      }
      return (
        field.family === 'listbox' &&
        field.selectedValues.length === write.values.length &&
        field.selectedValues.every((value, index) => value === write.values[index])
      );
  }
}

/**
 * Whether a reset would leave `field` as it is: its value is its default, and
 * a checkbox's or radio group's buttons show that default.
 */
export function isAtDefault(field: FormFieldDTO<Coordinates>): boolean {
  if (field.valueEntry.kind === 'unsupported') return false;
  if (!valueEntriesEqual(field.valueEntry, field.defaultValueEntry)) return false;
  if (field.family !== 'checkbox' && field.family !== 'radio') return true;
  const entry = field.defaultValueEntry;
  const state = entry.kind === 'scalar' ? entry.value : null;
  return field.widgets.every((widget) => widget.checked === (widget.onState === state));
}

/** Whether two value entries hold the same value. */
export function valueEntriesEqual(left: FormValueEntry, right: FormValueEntry): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === 'scalar' && right.kind === 'scalar') return left.value === right.value;
  if (left.kind === 'array' && right.kind === 'array') {
    return (
      left.values.length === right.values.length &&
      left.values.every((value, index) => value === right.values[index])
    );
  }
  return true;
}

/** A checkbox's or radio group's on-state for an export value; `'Off'` and `null` clear it. */
function toggleStateOf(
  field: Extract<FormFieldDTO<Coordinates>, { family: 'checkbox' | 'radio' }>,
  exportValue: string | null,
): string | null {
  if (exportValue === null || exportValue === 'Off') return null;
  const widget = field.widgets.find((candidate) => candidate.exportValue === exportValue);
  if (!widget) {
    throw invalidValue(`no widget of '${field.name}' has the export value '${exportValue}'`);
  }
  return widget.onState;
}

function choiceOf(
  field: Extract<FormFieldDTO<Coordinates>, { family: 'combobox' | 'listbox' }>,
  values: string[],
): FieldValueWrite {
  if (new Set(values).size !== values.length) {
    throw invalidValue('the values must not repeat');
  }
  if (field.family === 'listbox' && !field.multiSelect && values.length > 1) {
    throw invalidValue(`'${field.name}' takes one value (it has no multiSelect)`);
  }
  const optionValues = new Set(field.options.map((option) => option.value));
  const freeText = field.family === 'combobox' && field.edit && values.length === 1;
  const unknown = values.find((value) => !optionValues.has(value));
  if (!freeText && unknown !== undefined) {
    throw invalidValue(`'${unknown}' is not an option value of '${field.name}'`);
  }
  return { kind: 'choice', values };
}

function shapeOf(value: FormFieldValue): string {
  if ('checked' in value) return '{ checked }';
  if ('selectedValues' in value) return '{ selectedValues }';
  return '{ value }';
}

function invalidValue(message: string): EngineError {
  return new EngineError(EngineErrorCode.InvalidArg, message, { details: { field: 'value' } });
}
