/**
 * The viewer's features, and what `disable` and `readOnly` turn off.
 *
 * A feature is a command category: `annotations`, or one of its parts, `annotations.highlight`.
 * Turning a feature off turns off everything under it (the commands plugin matches whole dotted
 * segments). `disable` lists features and single commands in one list, told apart by the colon
 * every command id has; `readOnly` adds the features that change the document. A feature that's
 * off also stops people changing by hand what it made: the annotations and fields already in the
 * document (the annotation plugin's `editable` and the form plugin's `fillable` settings).
 */
import type { EditableKind, EditableKinds } from '@embedpdf/react/annotation';
import type { FillableFields, FormFieldFamily } from '@embedpdf/react/form';

/** Every built-in feature and its parts. */
const FEATURE_PARTS = {
  annotations: ['highlight', 'markup', 'drawing', 'text', 'notes', 'links'],
  shapes: [],
  stamps: [],
  comments: ['writing'],
  forms: ['filling', 'building'],
  signatures: ['signing', 'checking'],
  redaction: [],
  measurement: [],
  pages: [],
  attachments: ['adding'],
  text: ['selection', 'copy'],
  search: [],
  thumbnails: [],
  outline: [],
  documents: ['open', 'download', 'print', 'tabs'],
} as const;

type FeatureParts = typeof FEATURE_PARTS;

/** A built-in feature, or a part of one: `'annotations'`, `'annotations.highlight'`. */
export type Feature = {
  [Name in keyof FeatureParts]: Name | `${Name}.${FeatureParts[Name][number]}`;
}[keyof FeatureParts];

/** What `readOnly` keeps on: every feature it would turn off, minus these. */
export interface ReadOnlyExceptions {
  readonly except: readonly (Feature | (string & {}))[];
}

/** The features that change the document: what `readOnly` turns off. */
const READ_ONLY_FEATURES: readonly Feature[] = [
  'annotations',
  'shapes',
  'stamps',
  'comments.writing',
  'forms',
  'signatures.signing',
  'redaction',
  'measurement',
  'pages',
  'attachments.adding',
];

const isInside = (feature: string, outer: string): boolean =>
  feature === outer || feature.startsWith(`${outer}.`);

/**
 * Whether nothing that changes the document is left, `isOff` saying which features are off (the
 * commands plugin's `isCategoryDisabled`): what the View only label shows for.
 */
export const leavesNothingToChange = (isOff: (feature: string) => boolean): boolean =>
  READ_ONLY_FEATURES.every(isOff);

/**
 * The annotations each feature makes, by the names the annotation plugin's `editable` setting
 * takes: a subtype, or a measurement's intent. Every subtype people can change is here; a popup
 * or an unsupported annotation is never changed by hand. A signature placed off a field is a
 * stamp; one drawn into a field is the field's value.
 */
const FEATURE_ANNOTATIONS: Readonly<Record<string, readonly EditableKind[]>> = {
  'annotations.highlight': ['highlight'],
  'annotations.markup': ['underline', 'strikeout', 'squiggly'],
  'annotations.drawing': ['ink'],
  'annotations.text': ['free-text', 'caret'],
  'annotations.notes': ['text'],
  'annotations.links': ['link'],
  shapes: ['square', 'circle', 'line', 'polygon', 'polyline'],
  stamps: ['stamp'],
  redaction: ['redact'],
  measurement: ['line-dimension', 'polyline-dimension', 'polygon-dimension'],
  'attachments.adding': ['file-attachment'],
  // A field's boxes, moved and resized in the Form mode.
  'forms.building': ['widget'],
};

/** The fields each feature fills in, by the families the form plugin's `fillable` setting takes. */
const FEATURE_FIELDS: Readonly<Record<string, readonly FormFieldFamily[]>> = {
  'forms.filling': ['text', 'checkbox', 'radio', 'combobox', 'listbox', 'pushbutton'],
  'signatures.signing': ['signature'],
};

/** `true` while no feature of `table` is off, `false` once every one is, else what the ones on hold. */
function stillOn<Name>(
  table: Readonly<Record<string, readonly Name[]>>,
  off: readonly string[],
): boolean | Name[] {
  const features = Object.keys(table);
  const on = features.filter((feature) => !off.some((name) => isInside(feature, name)));
  if (on.length === features.length) return true;
  if (on.length === 0) return false;
  return on.flatMap((feature) => table[feature]!);
}

const partsOf = (feature: string): readonly string[] =>
  (FEATURE_PARTS as Readonly<Record<string, readonly string[]>>)[feature] ?? [];

/**
 * The features `readOnly` turns off, minus `except`. An exception inside a feature splits it
 * into its parts, so `except: ['forms.filling']` leaves `forms.building` off.
 */
function readOnlyFeaturesOf(readOnly: boolean | ReadOnlyExceptions | undefined): string[] {
  if (!readOnly) return [];
  const except = readOnly === true ? [] : readOnly.except;
  const off: string[] = [];
  const subtract = (feature: string): void => {
    if (except.some((kept) => isInside(feature, kept))) return;
    const parts = partsOf(feature);
    if (parts.length === 0 || !except.some((kept) => isInside(kept, feature))) {
      off.push(feature);
      return;
    }
    for (const part of parts) subtract(`${feature}.${part}`);
  };
  for (const feature of READ_ONLY_FEATURES) subtract(feature);
  return off;
}

/** The features `disable` and `readOnly` turn off: the names without a colon, and `readOnly`'s. */
function featuresOffOf(
  disable: readonly string[] | undefined,
  readOnly: boolean | ReadOnlyExceptions | undefined,
): string[] {
  const features = (disable ?? []).filter((name) => !name.includes(':'));
  return [...new Set([...features, ...readOnlyFeaturesOf(readOnly)])];
}

/** What the commands plugin turns off: its `disabledCategories` and `disabledCommands` settings. */
export interface DisabledSettings {
  readonly disabledCategories: readonly string[];
  readonly disabledCommands: readonly string[];
}

/**
 * The commands plugin's settings for a `disable` list and a `readOnly` value: the names with a
 * colon are command ids, the rest features, and `readOnly` adds its own features.
 */
export function disabledSettingsOf(
  disable: readonly string[] | undefined,
  readOnly: boolean | ReadOnlyExceptions | undefined,
): DisabledSettings {
  const commands = new Set((disable ?? []).filter((name) => name.includes(':')));
  return { disabledCategories: featuresOffOf(disable, readOnly), disabledCommands: [...commands] };
}

/** What people may change by hand: the annotation plugin's `editable` and the form plugin's `fillable`. */
export interface ByHandSettings {
  readonly editable: EditableKinds;
  readonly fillable: FillableFields;
}

/**
 * What people may still change by hand for a `disable` list and a `readOnly` value: the
 * annotations and fields of the features left on. A single command turned off leaves them.
 */
export function byHandSettingsOf(
  disable: readonly string[] | undefined,
  readOnly: boolean | ReadOnlyExceptions | undefined,
): ByHandSettings {
  const off = featuresOffOf(disable, readOnly);
  return { editable: stillOn(FEATURE_ANNOTATIONS, off), fillable: stillOn(FEATURE_FIELDS, off) };
}

/** Whether two `editable` or `fillable` values say the same. */
export const sameByHand = (
  left: boolean | readonly string[],
  right: boolean | readonly string[],
): boolean =>
  typeof left === 'boolean' || typeof right === 'boolean'
    ? left === right
    : left.length === right.length && left.every((name, index) => name === right[index]);
