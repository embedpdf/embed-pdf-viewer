import type { WidgetAppearance } from '../annotation/kinds/widget.shared';
import type { PdfRect } from '../geometry/primitives';
import type { PageObjectNumber } from '../identity/PageObjectNumber';

export type { WidgetAppearance } from '../annotation/kinds/widget.shared';

/**
 * Where (and how) a widget is born during `createField`. Under the hood
 * this IS an annotation create + `attachWidget`, composed in one atomic
 * engine job.
 */
export interface WidgetPlacement {
  pageObjectNumber: PageObjectNumber;
  /** PDF user space. */
  rect: PdfRect;
  /**
   * Toggles: this widget's checked appearance-state name (the token
   * toggle writes address). Required per widget for radio groups;
   * defaults to `"Yes"` for checkboxes. Ignored for other families.
   */
  onState?: string;
  appearance?: WidgetAppearance;
}

/** An option of a choice field at authoring time. */
export interface FormFieldOptionInput {
  label: string;
  /** Export value (used by /V, interchange, and choice writes). */
  value: string;
}

interface FormFieldDraftBase {
  /**
   * Dotted fully qualified name ("billing.name"). Missing non-terminal
   * ancestors are created; a sibling name collision fails with
   * `InvalidArg`.
   */
  name: string;
  readOnly?: boolean;
  required?: boolean;
  noExport?: boolean;
  /** /TU — the accessible tooltip. */
  alternateName?: string;
  /** /TM — the export mapping name. */
  mappingName?: string;
}

export interface TextFieldDraft extends FormFieldDraftBase {
  family: 'text';
  defaultValue?: string;
  maxLength?: number;
  multiline?: boolean;
  password?: boolean;
  comb?: boolean;
  widget?: WidgetPlacement;
}

export interface CheckboxFieldDraft extends FormFieldDraftBase {
  family: 'checkbox';
  widget?: WidgetPlacement;
}

/** ONE field, N widgets — the ISO radio model. */
export interface RadioFieldDraft extends FormFieldDraftBase {
  family: 'radio';
  radiosInUnison?: boolean;
  noToggleToOff?: boolean;
  /** Each placement must carry its `onState`. */
  widgets?: WidgetPlacement[];
}

export interface ComboBoxFieldDraft extends FormFieldDraftBase {
  family: 'combobox';
  /** Free text allowed in addition to the options. */
  edit?: boolean;
  options?: FormFieldOptionInput[];
  defaultValue?: string;
  widget?: WidgetPlacement;
}

export interface ListBoxFieldDraft extends FormFieldDraftBase {
  family: 'listbox';
  multiSelect?: boolean;
  options?: FormFieldOptionInput[];
  widget?: WidgetPlacement;
}

/**
 * What `doc.forms.createField` takes: per-family, mirroring the DTO union.
 * Push buttons and signatures are not authorable.
 */
export type FormFieldDraft =
  | TextFieldDraft
  | CheckboxFieldDraft
  | RadioFieldDraft
  | ComboBoxFieldDraft
  | ListBoxFieldDraft;
