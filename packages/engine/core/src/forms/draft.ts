import type { WidgetStyleDraftFields } from '../annotation/kinds/widget.shared';
import {
  writesScripts,
  type FieldActionsPatch,
  type WidgetActionsPatch,
} from '../dto/PdfAction';
import type { PageRef } from '../identity/PageRef';
import type { Coordinates, PageCoordinates } from '../pageSpace/coordinates';

/**
 * Where a widget goes and how it looks: its page, its box, and the same
 * style fields a widget annotation's update takes. `create()` places a
 * field's widgets with these, and `addWidget()` adds one.
 */
export interface WidgetPlacement<
  C extends Coordinates = PageCoordinates,
> extends WidgetStyleDraftFields {
  page: PageRef;
  rect: C['box'];
  /**
   * A checkbox or radio widget's export value: what the form data holds
   * while it's checked. Required for a radio button (and never `'Off'`);
   * `'Yes'` for a checkbox when left out. Other families take none.
   */
  exportValue?: string;
  /**
   * What the widget does when clicked (`activate`), entered, focused and so
   * on. A JavaScript, submit-form or URI action takes `doc.forms.script` too.
   */
  actions?: WidgetActionsPatch<C['destination']>;
}

/**
 * Whether creating a field from `draft` takes `doc.forms.script`: a script
 * among its actions, or a widget action that holds JavaScript, a submit or a
 * link.
 */
export function draftWritesScripts(draft: {
  readonly actions?: FieldActionsPatch;
  readonly widgets?: readonly { readonly actions?: WidgetActionsPatch<unknown> }[];
}): boolean {
  return (
    writesScripts(draft.actions) ||
    (draft.widgets ?? []).some((placement) => writesScripts(placement.actions))
  );
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
  /**
   * The field's scripts, by event (JavaScript only). A `calculate` script
   * puts the field at the end of the form's calculation order. Writing a
   * script takes `doc.forms.script` too.
   */
  actions?: FieldActionsPatch;
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
  widgets?: WidgetPlacement<C>[];
}

export interface CheckboxFieldDraft<
  C extends Coordinates = PageCoordinates,
> extends FormFieldDraftBase {
  family: 'checkbox';
  widgets?: WidgetPlacement<C>[];
}

/** One field, N widgets — the ISO radio model. */
export interface RadioFieldDraft<
  C extends Coordinates = PageCoordinates,
> extends FormFieldDraftBase {
  family: 'radio';
  radiosInUnison?: boolean;
  noToggleToOff?: boolean;
  /** One per button, each with its `exportValue`. */
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
  widgets?: WidgetPlacement<C>[];
}

export interface ListBoxFieldDraft<
  C extends Coordinates = PageCoordinates,
> extends FormFieldDraftBase {
  family: 'listbox';
  multiSelect?: boolean;
  options?: FormFieldOptionInput[];
  /** Option values `reset()` selects. */
  defaultValue?: string[];
  widgets?: WidgetPlacement<C>[];
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
  widgets?: WidgetPlacement<C>[];
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
