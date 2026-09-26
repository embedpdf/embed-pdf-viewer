import type { FormFieldOptionInput } from './draft';

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
}

/** What `doc.forms.update` takes. */
export type FormFieldPatch =
  | TextFieldPatch
  | CheckboxFieldPatch
  | RadioFieldPatch
  | ComboBoxFieldPatch
  | ListBoxFieldPatch;
