import type { FormFieldRef, FormWidget } from '../identity/FormFieldRef';
import type { IsoDateTime } from '../dto/IsoDateTime';
import type { PdfFieldActions } from '../dto/PdfAction';
import type { Coordinates, PageCoordinates } from '../pageSpace/coordinates';
import type { FormValueEntry } from './value-entry';

/**
 * The field family — the discriminant of {@link FormFieldDTO}. Narrowing on
 * it reveals exactly the members that are meaningful for that family, the
 * same way annotation DTOs narrow on `subtype`.
 */
export type FormFieldFamily =
  | 'text'
  | 'checkbox'
  | 'radio'
  | 'combobox'
  | 'listbox'
  | 'pushbutton'
  | 'signature'
  | 'unknown';

/**
 * Where the field was found.
 *
 * - `acroform` — reachable from the /AcroForm /Fields tree, as the spec
 *   requires.
 * - `recovered` — only reachable through a page's /Annots array (a common
 *   producer bug). The engine reconciles these on every read so they work
 *   like any other field, but other PDF processors will not see them until
 *   {@link DocumentFormsService.repair} makes the fix durable.
 */
export type FormFieldOrigin = 'acroform' | 'recovered';

/**
 * A widget of a field: its address and its page. Its place, look and state
 * are its row in the form's `widgets`, joined by `ref`.
 */
export type FormFieldWidget = FormWidget;

/**
 * A widget of a toggle (checkbox/radio) field. Toggle widgets always carry
 * their appearance-state machinery — no nullable fields to probe.
 */
export interface ToggleFieldWidget extends FormFieldWidget {
  /**
   * The widget's appearance state name in the file (the non-"Off" key of
   * its /AP /N dictionary), usually its export value. Writes never need it.
   */
  onState: string;
  /**
   * The widget's export value (/Opt entry when present, else the
   * on-state). The identity FDF/XFDF carry.
   */
  exportValue: string;
  /** Whether this widget is currently checked. */
  checked: boolean;
}

/** One option of a choice (combo/list box) field. */
export interface FormFieldOption {
  /** Display label shown to the user. */
  label: string;
  /** Export value used by /V, interchange, and `FormFieldValue.choice`. */
  value: string;
  /** Whether the option is currently selected. */
  selected: boolean;
}

/**
 * The trunk every field family shares: identity, provenance, universal
 * flags, and widget placement. A logical field is the document-scoped
 * record that holds the value; its widgets are page-scoped views — join
 * them to the annotation subsystem via each widget's `ref`.
 */
export interface FormFieldBase<C extends Coordinates = PageCoordinates> {
  /**
   * Durable ref: the field dictionary's object number, or its full name when
   * the dictionary is a direct object (spec-violating) and has no number.
   */
  ref: FormFieldRef;
  /** Fully qualified name, e.g. `"billing.name"`. */
  name: string;
  family: FormFieldFamily;
  origin: FormFieldOrigin;
  /**
   * The user must not change the value. The engine's write transactions
   * still accept programmatic writes to read-only fields (calculated
   * fields are read-only yet script-written); enforcing fill policy is
   * the application's job.
   */
  readOnly: boolean;
  /** PDF apps ask for a value before the form is submitted. */
  required: boolean;
  /** Left out when the form is submitted or exported. */
  noExport: boolean;
  /** /TU — the accessible tooltip / alternate name. */
  alternateName: string | null;
  /** /TM — the export mapping name. */
  mappingName: string | null;
  /** Exact effective `/V` object shape; family conveniences below are derived. */
  valueEntry: FormValueEntry;
  /** Exact effective `/DV` object shape, including absent and malformed values. */
  defaultValueEntry: FormValueEntry;
  /** Effective inherited field `/AA` actions. */
  actions?: PdfFieldActions<C['destination']>;
  /**
   * The user who created the field, as the creating session's identity
   * named them; `null` for a field another tool made, or an anonymous
   * session.
   */
  createdBy: string | null;
  /** When the field was created; `null` when nobody recorded it. */
  createdAt: IsoDateTime | null;
  /**
   * The user whose write last changed the value: a fill, or the script that
   * fill ran (a calculated total counts as filled by whoever's fill
   * calculated it). `null` after a reset, or when an anonymous session
   * filled it last.
   */
  filledBy: string | null;
  /** That user's display name, as their session gave it. */
  filledByName: string | null;
  /** When the value last changed by a fill; `null` with `filledBy`. */
  filledAt: IsoDateTime | null;
  /** The session that restored this field's attribution in an import. */
  importedBy: string | null;
  /** The field's widget annotations, in control order. May be empty ("unplaced"). */
  widgets: FormFieldWidget[];
}

/** A text field. Write with `{ value }`. */
export interface TextFieldDTO<C extends Coordinates = PageCoordinates> extends FormFieldBase<C> {
  family: 'text';
  value: string;
  /** /DV — restored by `reset()`. */
  defaultValue: string;
  /** /MaxLen; `null` when unlimited. Longer writes are truncated to this length. */
  maxLength: number | null;
  multiline: boolean;
  password: boolean;
  /** Fixed character cells; meaningful with `maxLength`. */
  comb: boolean;
}

/** A checkbox. Write with `{ checked }`, or `{ value }` naming a widget's export value. */
export interface CheckboxFieldDTO<
  C extends Coordinates = PageCoordinates,
> extends FormFieldBase<C> {
  family: 'checkbox';
  checked: boolean;
  /** The export value reported while checked ("Off" is never exported). */
  exportValue: string;
  widgets: ToggleFieldWidget[];
}

/** A radio group: One field, N widgets. Write with `{ value }`, a button's export value. */
export interface RadioFieldDTO<C extends Coordinates = PageCoordinates> extends FormFieldBase<C> {
  family: 'radio';
  /** The checked widget's export value, or `"Off"` when the group is clear. */
  value: string;
  /** Widgets sharing an export value check together. */
  radiosInUnison: boolean;
  /** The group cannot be cleared once a choice is made. */
  noToggleToOff: boolean;
  widgets: ToggleFieldWidget[];
}

/** A combo box (dropdown). Write with `{ value }`. */
export interface ComboBoxFieldDTO<
  C extends Coordinates = PageCoordinates,
> extends FormFieldBase<C> {
  family: 'combobox';
  /** An option export value — or free text when `edit` is set. */
  value: string;
  /** /DV — restored by `reset()`. */
  defaultValue: string;
  /** Free text is allowed in addition to the options. */
  edit: boolean;
  options: FormFieldOption[];
}

/** A list box. Write with `{ selectedValues }`. */
export interface ListBoxFieldDTO<C extends Coordinates = PageCoordinates> extends FormFieldBase<C> {
  family: 'listbox';
  /** Selected option export values, in option order. */
  selectedValues: string[];
  /** /DV — the option values `reset()` selects. */
  defaultValue: string[];
  /** Whether several options may be selected at once. */
  multiSelect: boolean;
  options: FormFieldOption[];
}

/** A push button: pure trigger, holds no value. Never written or exported. */
export interface PushButtonFieldDTO<
  C extends Coordinates = PageCoordinates,
> extends FormFieldBase<C> {
  family: 'pushbutton';
}

/**
 * A signature field: identity and placement only. Form writes never set a
 * signature value; signing goes through the signatures API.
 */
export interface SignatureFieldDTO<
  C extends Coordinates = PageCoordinates,
> extends FormFieldBase<C> {
  family: 'signature';
}

/**
 * Forward-compat placeholder for field types the engine does not model,
 * mirroring the `unsupported` annotation kind. Round-trips safely.
 */
export interface UnknownFieldDTO<C extends Coordinates = PageCoordinates> extends FormFieldBase<C> {
  family: 'unknown';
  /** The raw /V value as text, for diagnostics. */
  rawValue: string;
}

/**
 * A logical form field. Discriminated on `family`:
 *
 * ```ts
 * if (field.family === 'listbox') {
 *   field.selectedValues; // string[]
 * }
 * ```
 */
export type FormFieldDTO<C extends Coordinates = PageCoordinates> =
  | TextFieldDTO<C>
  | CheckboxFieldDTO<C>
  | RadioFieldDTO<C>
  | ComboBoxFieldDTO<C>
  | ListBoxFieldDTO<C>
  | PushButtonFieldDTO<C>
  | SignatureFieldDTO<C>
  | UnknownFieldDTO<C>;
