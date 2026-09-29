import type { WidgetAppearance } from '../annotation/kinds/widget.shared';
import type { PageRef } from '../identity/PageRef';
import type { Coordinates, PageCoordinates } from '../pageSpace/coordinates';

export type { WidgetAppearance } from '../annotation/kinds/widget.shared';

/**
 * Where (and how) a widget is born during `createField`. Under the hood
 * this is an annotation create + `attachWidget`, composed in one atomic
 * engine job.
 */
export interface WidgetPlacement<C extends Coordinates = PageCoordinates> {
  page: PageRef;
  rect: C['box'];
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

export interface TextFieldDraft<
  C extends Coordinates = PageCoordinates,
> extends FormFieldDraftBase {
  family: 'text';
  defaultValue?: string;
  maxLength?: number;
  multiline?: boolean;
  password?: boolean;
  comb?: boolean;
  widget?: WidgetPlacement<C>;
}

export interface CheckboxFieldDraft<
  C extends Coordinates = PageCoordinates,
> extends FormFieldDraftBase {
  family: 'checkbox';
  widget?: WidgetPlacement<C>;
}

/** One field, N widgets — the ISO radio model. */
export interface RadioFieldDraft<
  C extends Coordinates = PageCoordinates,
> extends FormFieldDraftBase {
  family: 'radio';
  radiosInUnison?: boolean;
  noToggleToOff?: boolean;
  /** Each placement must carry its `onState`. */
  widgets?: WidgetPlacement<C>[];
}

export interface ComboBoxFieldDraft<
  C extends Coordinates = PageCoordinates,
> extends FormFieldDraftBase {
  family: 'combobox';
  /** Free text allowed in addition to the options. */
  edit?: boolean;
  options?: FormFieldOptionInput[];
  defaultValue?: string;
  widget?: WidgetPlacement<C>;
}

export interface ListBoxFieldDraft<
  C extends Coordinates = PageCoordinates,
> extends FormFieldDraftBase {
  family: 'listbox';
  multiSelect?: boolean;
  options?: FormFieldOptionInput[];
  widget?: WidgetPlacement<C>;
}

/**
 * A signature field: identity and (usually) one widget. Created unsigned;
 * signing it is `doc.signatures`' job, drawing a mark into it without
 * signing is `doc.forms.setSignatureAppearance`.
 */
export interface SignatureFieldDraft<
  C extends Coordinates = PageCoordinates,
> extends FormFieldDraftBase {
  family: 'signature';
  widget?: WidgetPlacement<C>;
}

/**
 * What `doc.forms.createField` takes: per-family, mirroring the DTO union.
 * Push buttons are not authorable.
 */
export type FormFieldDraft<C extends Coordinates = PageCoordinates> =
  | TextFieldDraft<C>
  | CheckboxFieldDraft<C>
  | RadioFieldDraft<C>
  | ComboBoxFieldDraft<C>
  | ListBoxFieldDraft<C>
  | SignatureFieldDraft<C>;
