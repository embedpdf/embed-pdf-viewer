/**
 * A typed value write for one field. The `type` must match the target
 * field's family — the engine rejects mismatches with `InvalidArg` rather
 * than guessing:
 *
 * - `text` → text-family fields. Values longer than /MaxLen are truncated.
 * - `toggle` → checkbox/radio. `state` is a widget's `onState` token and
 *   selects WHICH widget of the group is checked; `null` clears the group
 *   (rejected for radios with `noToggleToOff`). Sibling widgets update
 *   together (checkboxes and in-unison radios check all widgets sharing
 *   the target's export value).
 * - `choice` → combo/list boxes, by option export value. Multiple values
 *   need a multi-select list box; an empty array clears the selection.
 *   Combo boxes with the `edit` flag accept one free-text value.
 */
export type FormFieldValue =
  | { type: 'text'; value: string }
  | { type: 'toggle'; state: string | null }
  | { type: 'choice'; values: string[] };

/** Serialized form-data interchange formats. */
export type FormDataFormat = 'fdf' | 'xfdf';
