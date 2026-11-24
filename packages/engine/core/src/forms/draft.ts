import type { FormFieldFormatWritable } from './format';
import type { WidgetStyleDraftFields } from '../annotation/kinds/widget.shared';
import { writesScripts, type FieldActionsPatch, type WidgetActionsPatch } from '../dto/PdfAction';
import type { PdfRotation } from '../geometry/primitives';
import type { PageRef } from '../identity/PageRef';
import type { Coordinates, PageCoordinates } from '../pageSpace/coordinates';

/**
 * Where a widget goes and how it looks: its page, its place on it and its
 * turn, and the same style fields a widget annotation's update takes.
 * `create()` places a field's widgets with these, and `addWidget()` adds one.
 *
 * The place is `rect` or `box`, as for every kind that turns: where the
 * widget stands on the page, or the frame its contents are laid out in,
 * before the turn. Give one; with both, `box` is the shape.
 */
export interface WidgetPlacement<
  C extends Coordinates = PageCoordinates,
> extends WidgetStyleDraftFields {
  page: PageRef;
  /** Where the widget stands on the page: its `box`, turned. */
  rect?: C['box'];
  /** The frame its contents are laid out in, before the turn: `rect` with its sides swapped under 90 and 270. */
  box?: C['box'];
  /**
   * How its contents turn, degrees clockwise: a quarter turn (`/MK /R`).
   * With 90 or 270 the text runs along the rect's height, as Acrobat's
   * Orientation turns it. Upright when left out.
   */
  rotation?: PdfRotation;
  /**
   * A checkbox or radio widget's export value: what the form data holds
   * while it's checked. Required for a radio button (and never `'Off'`);
   * `'Yes'` for a checkbox when left out. Other kinds take none.
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
   * The group the field goes in: who fills it in. Left out or `null`, the
   * field is in no group. The session's own group (`identity.groupId`) takes
   * no right of its own; another takes `fields:set-group` for it.
   */
  groupId?: string | null;
  /**
   * What the field's value means: `email`, `date-signed`, or a name of
   * your own, 1 to 256 characters with no space at its start or end. Left
   * out or `null`, the field has none.
   */
  purpose?: string | null;
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
  kind: 'text';
  defaultValue?: string;
  maxLength?: number;
  multiline?: boolean;
  password?: boolean;
  comb?: boolean;
  /**
   * The shape the value has: a date or a time with its pattern. The engine
   * writes the field's format script and keystroke script from it, as
   * Acrobat writes them, so it takes no `doc.forms.script` and can't go
   * beside `actions.format` or `actions.keystroke`. Left out or `null`,
   * the field has no format.
   */
  format?: FormFieldFormatWritable | null;
  widgets?: WidgetPlacement<C>[];
}

export interface CheckboxFieldDraft<
  C extends Coordinates = PageCoordinates,
> extends FormFieldDraftBase {
  kind: 'checkbox';
  widgets?: WidgetPlacement<C>[];
}

/** One field, N widgets — the ISO radio model. */
export interface RadioFieldDraft<
  C extends Coordinates = PageCoordinates,
> extends FormFieldDraftBase {
  kind: 'radio';
  radiosInUnison?: boolean;
  noToggleToOff?: boolean;
  /** One per button, each with its `exportValue`. */
  widgets?: WidgetPlacement<C>[];
}

export interface ComboBoxFieldDraft<
  C extends Coordinates = PageCoordinates,
> extends FormFieldDraftBase {
  kind: 'combobox';
  /** Free text allowed in addition to the options. */
  edit?: boolean;
  options?: FormFieldOptionInput[];
  defaultValue?: string;
  /** The shape the value has, as a text field's draft takes it. */
  format?: FormFieldFormatWritable | null;
  widgets?: WidgetPlacement<C>[];
}

export interface ListBoxFieldDraft<
  C extends Coordinates = PageCoordinates,
> extends FormFieldDraftBase {
  kind: 'listbox';
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
  kind: 'signature';
  widgets?: WidgetPlacement<C>[];
}

/**
 * A push button: no value, only widgets, each with its `caption` and
 * usually an `activate` action (reset the form, go to a page, submit).
 */
export interface PushButtonFieldDraft<
  C extends Coordinates = PageCoordinates,
> extends FormFieldDraftBase {
  kind: 'pushbutton';
  widgets?: WidgetPlacement<C>[];
}

/** What `doc.forms.create` takes: per kind, mirroring the DTO union. */
export type FormFieldDraft<C extends Coordinates = PageCoordinates> =
  | TextFieldDraft<C>
  | CheckboxFieldDraft<C>
  | RadioFieldDraft<C>
  | ComboBoxFieldDraft<C>
  | ListBoxFieldDraft<C>
  | PushButtonFieldDraft<C>
  | SignatureFieldDraft<C>;
