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

/** Serialized form-data interchange formats. */
export type FormDataFormat = 'fdf' | 'xfdf';
