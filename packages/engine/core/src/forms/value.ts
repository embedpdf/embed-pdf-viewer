import type { FormFieldDTO } from './field';
import type { Coordinates } from '../pageSpace/coordinates';

/**
 * A value to write to one field, in the fields a read of it returns:
 *
 * - `{ value }`: a text field's text; a radio group's or a checkbox's
 *   choice, by the export value of the widget to check (`'Off'` or `null`
 *   clears it); a dropdown's option value (or free text when it allows
 *   editing; `null` clears it). `null` empties a text field.
 * - `{ checked }`: a checkbox. `true` checks its first widget.
 * - `{ selectedValues }`: a list's option values; `[]` clears it.
 *
 * A shape the field's family doesn't take fails with `InvalidArg`.
 */
export type FormFieldValue =
  | { value: string | null }
  | { checked: boolean }
  | { selectedValues: string[] };

/**
 * The value `field` holds, as a value write takes it: writing it to the
 * same field changes nothing. `null` for a field whose value a write can't
 * set (a push button, a signature, a family the engine doesn't know).
 */
export function fieldValueOf(field: FormFieldDTO<Coordinates>): FormFieldValue | null {
  switch (field.family) {
    case 'checkbox':
      return { checked: field.checked };
    case 'listbox':
      return { selectedValues: field.selectedValues };
    case 'radio':
      return { value: field.value === 'Off' ? null : field.value };
    case 'text':
    case 'combobox':
      return { value: field.value };
    default:
      return null;
  }
}
