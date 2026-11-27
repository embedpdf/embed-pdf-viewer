import type { FormFieldOptionInput } from './draft';
import type { FormFieldFormatWritable } from './format';
import type { FieldActionsPatch } from '../dto/PdfAction';

/**
 * Patch-field semantics follow the annotation patches: `undefined` leaves
 * a member untouched, `null` clears it, a value sets it. The engine knows
 * the field's kind from its ref, so `kind` is optional; when given it
 * must match. A member the field's kind doesn't have (`multiline` on a
 * checkbox) fails with `InvalidArg`.
 */
interface FormFieldPatchBase {
  /**
   * Rename the field's own /T segment (not the dotted path — reparenting
   * is not supported). A sibling name collision fails with `InvalidArg`.
   */
  name?: string;
  readOnly?: boolean;
  required?: boolean;
  noExport?: boolean;
  alternateName?: string | null;
  mappingName?: string | null;
  /**
   * Move the field to another group: the session's own, or one it has
   * `fields:set-group` for. `null` takes the field out of its group, which
   * takes no `fields:set-group` right: form design is enough.
   */
  groupId?: string | null;
  /**
   * Every signer may fill the field in. `true` takes `fields:set-group:all`
   * and a field the update leaves in no group: to move a field from a
   * group, send `groupId: null` with it. `false` takes form design alone.
   * A signature field is never one.
   */
  forAnyone?: boolean;
  /** What the field's value means; `null` takes the purpose away. */
  purpose?: string | null;
  /**
   * The field's scripts, by event (JavaScript only): a script sets one,
   * `null` removes it, an event left out keeps what it has. Adding a
   * `calculate` script puts the field at the end of the calculation order;
   * removing it takes the field out. Writing a script takes
   * `doc.forms.script` too; removing one doesn't.
   */
  actions?: FieldActionsPatch;
}

export interface TextFieldPatch extends FormFieldPatchBase {
  kind?: 'text';
  defaultValue?: string | null;
  /** `null` clears the limit. Fails when the current value exceeds it. */
  maxLength?: number | null;
  multiline?: boolean;
  password?: boolean;
  comb?: boolean;
  /**
   * The shape the value has: a date or a time with its pattern, which
   * replaces the field's format script and keystroke script; `null`
   * removes both. The format the field already has changes nothing. It
   * takes no `doc.forms.script`, and can't go beside `actions.format` or
   * `actions.keystroke`.
   */
  format?: FormFieldFormatWritable | null;
}

export interface CheckboxFieldPatch extends FormFieldPatchBase {
  kind?: 'checkbox';
}

export interface RadioFieldPatch extends FormFieldPatchBase {
  kind?: 'radio';
  radiosInUnison?: boolean;
  noToggleToOff?: boolean;
}

export interface ComboBoxFieldPatch extends FormFieldPatchBase {
  kind?: 'combobox';
  edit?: boolean;
  defaultValue?: string | null;
  /**
   * Replace the option list. The current selection is re-synced: selected
   * exports that vanish are dropped; an edit combo's free text survives.
   */
  options?: FormFieldOptionInput[];
  /** The shape the value has, as a text field's patch takes it. */
  format?: FormFieldFormatWritable | null;
}

export interface ListBoxFieldPatch extends FormFieldPatchBase {
  kind?: 'listbox';
  multiSelect?: boolean;
  options?: FormFieldOptionInput[];
  /** Option values `reset()` selects; `null` removes the default. */
  defaultValue?: string[] | null;
}

/** A push button: only the settings every field has. Its captions are its widgets'. */
export interface PushButtonFieldPatch extends FormFieldPatchBase {
  kind?: 'pushbutton';
}

/** A signature field: only the settings every field has. Signing is `doc.signatures`'. */
export interface SignatureFieldPatch extends FormFieldPatchBase {
  kind?: 'signature';
}

/** What `doc.forms.update` takes. */
export type FormFieldPatch =
  | TextFieldPatch
  | CheckboxFieldPatch
  | RadioFieldPatch
  | ComboBoxFieldPatch
  | ListBoxFieldPatch
  | PushButtonFieldPatch
  | SignatureFieldPatch;
