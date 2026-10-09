import type { FormFieldOptionInput } from './draft';
import type { FieldActionsPatch } from '../dto/PdfAction';

/**
 * Patch-field semantics follow the annotation patches: `undefined` leaves
 * a member untouched, `null` clears it, a value sets it. The engine knows
 * the field's family from its ref, so `family` is optional; when given it
 * must match. A member the field's family doesn't have (`multiline` on a
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
   * `fields:set-group` for. A group can be changed, never removed.
   */
  groupId?: string;
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
  family?: 'text';
  defaultValue?: string | null;
  /** `null` clears the limit. Fails when the current value exceeds it. */
  maxLength?: number | null;
  multiline?: boolean;
  password?: boolean;
  comb?: boolean;
}

export interface CheckboxFieldPatch extends FormFieldPatchBase {
  family?: 'checkbox';
}

export interface RadioFieldPatch extends FormFieldPatchBase {
  family?: 'radio';
  radiosInUnison?: boolean;
  noToggleToOff?: boolean;
}

export interface ComboBoxFieldPatch extends FormFieldPatchBase {
  family?: 'combobox';
  edit?: boolean;
  defaultValue?: string | null;
  /**
   * Replace the option list. The current selection is re-synced: selected
   * exports that vanish are dropped; an edit combo's free text survives.
   */
  options?: FormFieldOptionInput[];
}

export interface ListBoxFieldPatch extends FormFieldPatchBase {
  family?: 'listbox';
  multiSelect?: boolean;
  options?: FormFieldOptionInput[];
  /** Option values `reset()` selects; `null` removes the default. */
  defaultValue?: string[] | null;
}

/** A push button: only the settings every field has. Its captions are its widgets'. */
export interface PushButtonFieldPatch extends FormFieldPatchBase {
  family?: 'pushbutton';
}

/** A signature field: only the settings every field has. Signing is `doc.signatures`'. */
export interface SignatureFieldPatch extends FormFieldPatchBase {
  family?: 'signature';
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
