import type { FormFieldOptionInput } from './draft';

/**
 * Patch-field semantics follow the annotation patches: `undefined` leaves
 * a member untouched, `null` clears it, a value sets it. Repeat the
 * `family` so the engine knows which members are valid (`InvalidArg` on a
 * mismatch with the target field).
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
}

export interface TextFieldPatch extends FormFieldPatchBase {
  family: 'text';
  defaultValue?: string | null;
  /** `null` clears the limit. Fails when the current value exceeds it. */
  maxLength?: number | null;
  multiline?: boolean;
  password?: boolean;
  comb?: boolean;
}

export interface CheckboxFieldPatch extends FormFieldPatchBase {
  family: 'checkbox';
}

export interface RadioFieldPatch extends FormFieldPatchBase {
  family: 'radio';
  radiosInUnison?: boolean;
  noToggleToOff?: boolean;
}

export interface ComboBoxFieldPatch extends FormFieldPatchBase {
  family: 'combobox';
  edit?: boolean;
  defaultValue?: string | null;
  /**
   * Replace the option list. The current selection is re-synced: selected
   * exports that vanish are dropped; an edit combo's free text survives.
   */
  options?: FormFieldOptionInput[];
}

export interface ListBoxFieldPatch extends FormFieldPatchBase {
  family: 'listbox';
  multiSelect?: boolean;
  options?: FormFieldOptionInput[];
}

/** What `doc.forms.updateField` takes. */
export type FormFieldPatch =
  | TextFieldPatch
  | CheckboxFieldPatch
  | RadioFieldPatch
  | ComboBoxFieldPatch
  | ListBoxFieldPatch;
