import type { FormFieldRef, FormWidgetRef } from '../identity/FormFieldRef';
import type { PdfFieldActions } from '../dto/PdfAction';
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
 * The /Ff flags every field family shares. Family-specific flags (comb,
 * multi-select, radios-in-unison, ...) live as plain booleans on the
 * family DTOs where they are always meaningful.
 */
export interface FormFieldFlags {
  /**
   * The user must not change the value. The engine's write transactions
   * still accept programmatic writes to read-only fields (calculated
   * fields are read-only yet script-written); enforcing fill policy is
   * the application's job.
   */
  readOnly: boolean;
  required: boolean;
  noExport: boolean;
  /** The raw /Ff integer, for anything not surfaced. */
  raw: number;
}

/**
 * A widget of a toggle (checkbox/radio) field. Toggle widgets always carry
 * their appearance-state machinery — no nullable fields to probe.
 */
export interface ToggleFieldWidget extends FormWidgetRef {
  /**
   * The widget's appearance state name (the non-"Off" key of its /AP /N
   * dictionary) — the token toggle writes address widgets by.
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
 * them to the annotation subsystem via `annotObjectNumber`.
 */
export interface FormFieldBase {
  /** Durable ref (`objectNumber` whenever the field dictionary is indirect). */
  ref: FormFieldRef;
  /** Field dictionary object number; `0` for direct (spec-violating) dicts. */
  fieldObjectNumber: number;
  /** Fully qualified name, e.g. `"billing.name"`. */
  name: string;
  family: FormFieldFamily;
  origin: FormFieldOrigin;
  flags: FormFieldFlags;
  /** /TU — the accessible tooltip / alternate name. */
  alternateName: string | null;
  /** /TM — the export mapping name. */
  mappingName: string | null;
  /** Exact effective `/V` object shape; family conveniences below are derived. */
  valueEntry: FormValueEntry;
  /** Exact effective `/DV` object shape, including absent and malformed values. */
  defaultValueEntry: FormValueEntry;
  /** Effective inherited field `/AA` actions. */
  actions?: PdfFieldActions;
  /** The field's widget annotations, in control order. May be empty ("unplaced"). */
  widgets: FormWidgetRef[];
}

/** A text field. Write with `{ type: 'text', value }`. */
export interface TextFieldDTO extends FormFieldBase {
  family: 'text';
  value: string;
  /** /DV — restored by `reset()`. */
  defaultValue: string;
  /** /MaxLen; `null` when unlimited. Writes beyond it are rejected. */
  maxLength: number | null;
  multiline: boolean;
  password: boolean;
  /** Fixed character cells; meaningful with `maxLength`. */
  comb: boolean;
}

/** A checkbox. Write with `{ type: 'toggle', state: onState | null }`. */
export interface CheckboxFieldDTO extends FormFieldBase {
  family: 'checkbox';
  checked: boolean;
  /** The export value reported while checked ("Off" is never exported). */
  exportValue: string;
  widgets: ToggleFieldWidget[];
}

/** A radio group: ONE field, N widgets. Write with `{ type: 'toggle', state }`. */
export interface RadioFieldDTO extends FormFieldBase {
  family: 'radio';
  /** The checked widget's export value, or `"Off"` when the group is clear. */
  value: string;
  /** Widgets sharing an export value check together. */
  radiosInUnison: boolean;
  /** The group cannot be cleared once a choice is made. */
  noToggleToOff: boolean;
  widgets: ToggleFieldWidget[];
}

/** A combo box (dropdown). Write with `{ type: 'choice', values: [v] }`. */
export interface ComboBoxFieldDTO extends FormFieldBase {
  family: 'combobox';
  /** An option export value — or free text when `edit` is set. */
  value: string;
  /** /DV — restored by `reset()`. */
  defaultValue: string;
  /** Free text is allowed in addition to the options. */
  edit: boolean;
  options: FormFieldOption[];
}

/** A list box. Write with `{ type: 'choice', values }`. */
export interface ListBoxFieldDTO extends FormFieldBase {
  family: 'listbox';
  /** Selected option export values, in option order. */
  selectedValues: string[];
  /** Whether several options may be selected at once. */
  multiSelect: boolean;
  options: FormFieldOption[];
}

/** A push button: pure trigger, holds no value. Never written or exported. */
export interface PushButtonFieldDTO extends FormFieldBase {
  family: 'pushbutton';
}

/**
 * A signature field. Identity and placement only for now — the engine
 * never writes signature values; signing is a future capability.
 */
export interface SignatureFieldDTO extends FormFieldBase {
  family: 'signature';
}

/**
 * Forward-compat placeholder for field types the engine does not model,
 * mirroring the `unsupported` annotation kind. Round-trips safely.
 */
export interface UnknownFieldDTO extends FormFieldBase {
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
export type FormFieldDTO =
  | TextFieldDTO
  | CheckboxFieldDTO
  | RadioFieldDTO
  | ComboBoxFieldDTO
  | ListBoxFieldDTO
  | PushButtonFieldDTO
  | SignatureFieldDTO
  | UnknownFieldDTO;
