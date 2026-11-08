/**
 * The viewer's features, and what `features`, `disable` and `readOnly` turn on and off.
 *
 * A feature is a command category: `annotations`, or one of its parts, `annotations.highlight`.
 * Turning a feature off turns off everything under it (the commands plugin matches whole dotted
 * segments). `features` says on or off by name, over the defaults (`START_OFF_FEATURES` start
 * off); a part wins over its feature. `disable`, from 3.0, lists features and single commands in
 * one list, told apart by the colon every command id has; `readOnly` turns off the features that
 * change the document, last. A feature that's off also stops people changing by hand what it made:
 * the annotations and fields already in the document (the annotation plugin's `editable` and the
 * form plugin's `fillable` settings).
 */
import type { EditableKind, EditableKinds } from '@embedpdf/react/annotation';
import type { FillableFields, FormFieldKind } from '@embedpdf/react/form';

/** Every built-in feature and its parts: the names `features` takes, as All features lists them. */
export const FEATURE_PARTS = {
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
  snapshots: [],
  search: [],
  thumbnails: [],
  outline: ['editing'],
  documents: ['open', 'download', 'print', 'tabs'],
} as const;

type FeatureParts = typeof FEATURE_PARTS;

/** A built-in feature, or a part of one: `'annotations'`, `'annotations.highlight'`. */
export type Feature = {
  [Name in keyof FeatureParts]: Name | `${Name}.${FeatureParts[Name][number]}`;
}[keyof FeatureParts];

/**
 * Whether people can do each feature, or part, in this viewer: `true` or `false` by its name.
 * One left out keeps its default. A part wins over its feature, so
 * `{ annotations: false, 'annotations.highlight': true }` is highlighting and nothing else.
 */
export type Features = { readonly [Name in Feature]?: boolean } & {
  /** Your own features, by your commands' `categories`. */
  readonly [yours: string]: boolean | undefined;
};

/** The features and parts that start off: on once `features` turns them on. */
export const START_OFF_FEATURES: readonly Feature[] = [
  'forms.building',
  'redaction',
  'measurement',
  'snapshots',
];

/** What `readOnly` keeps on: every feature it would turn off, minus these. */
export interface ReadOnlyExceptions {
  readonly except: readonly (Feature | (string & {}))[];
}

/** The features that change the document: what `readOnly` turns off. */
export const READ_ONLY_FEATURES: readonly Feature[] = [
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
  'outline.editing',
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
const FEATURE_FIELDS: Readonly<Record<string, readonly FormFieldKind[]>> = {
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

/** What the app says about features: `features`, `disable` (from 3.0) and `readOnly`. */
export interface FeatureChoices {
  readonly features?: Features | undefined;
  readonly disable?: readonly string[] | undefined;
  readonly readOnly?: boolean | ReadOnlyExceptions | undefined;
}

/** A name's feature, and its part after the first dot: `['annotations', 'highlight']`. */
const featureAndPart = (name: string): readonly [feature: string, part: string | undefined] => {
  const dot = name.indexOf('.');
  return dot < 0 ? [name, undefined] : [name.slice(0, dot), name.slice(dot + 1)];
};

/** Every feature and its parts: the built-in ones, and those your commands' categories name. */
function featureTreeOf(yours: readonly string[]): ReadonlyMap<string, readonly string[]> {
  const tree = new Map<string, string[]>(
    Object.entries(FEATURE_PARTS).map(([feature, parts]) => [feature, [...parts]]),
  );
  for (const category of yours) {
    const [feature, part] = featureAndPart(category);
    const parts = tree.get(feature) ?? [];
    if (part !== undefined && !parts.includes(part)) parts.push(part);
    tree.set(feature, parts);
  }
  return tree;
}

/** A feature while the choices are read: on or off, and each of its parts. */
interface FeatureState {
  on: boolean;
  readonly parts: Map<string, boolean>;
}

/**
 * The features that are off, read layer over layer: the defaults, `disable`, `features`, then
 * `readOnly`. In each layer a feature comes before its parts, so a part wins; a feature covers
 * every part it has. A feature is off whole only while none of its parts is on, so
 * `{ annotations: false, 'annotations.highlight': true }` keeps the Annotate tab, for
 * highlighting. `yours` are your commands' categories, whose parts a feature covers too.
 */
function featuresOffOf(
  { features, disable, readOnly }: FeatureChoices,
  yours: readonly string[],
): string[] {
  const tree = featureTreeOf(yours);
  const states = new Map<string, FeatureState>();
  const stateOf = (feature: string): FeatureState => {
    let state = states.get(feature);
    if (!state) {
      const parts = tree.get(feature) ?? [];
      state = { on: true, parts: new Map(parts.map((part) => [part, true])) };
      states.set(feature, state);
    }
    return state;
  };
  const read = (layer: readonly (readonly [name: string, on: boolean])[]): void => {
    const featuresFirst = [...layer].sort(
      ([left], [right]) => Number(left.includes('.')) - Number(right.includes('.')),
    );
    for (const [name, on] of featuresFirst) {
      const [feature, part] = featureAndPart(name);
      const state = stateOf(feature);
      if (part !== undefined) {
        state.parts.set(part, on);
        continue;
      }
      state.on = on;
      for (const each of state.parts.keys()) state.parts.set(each, on);
    }
  };
  const off = (names: readonly string[]) => names.map((name) => [name, false] as const);
  read(off(START_OFF_FEATURES));
  read(off((disable ?? []).filter((name) => !name.includes(':'))));
  read(
    Object.entries(features ?? {}).filter(
      (entry): entry is [string, boolean] => typeof entry[1] === 'boolean',
    ),
  );
  read(off(readOnlyFeaturesOf(readOnly)));
  // In the tree's order, the built-in features first.
  return [...tree.keys(), ...states.keys()]
    .filter((feature, index, all) => all.indexOf(feature) === index && states.has(feature))
    .flatMap((feature) => {
      const { on, parts } = states.get(feature)!;
      const offParts = [...parts].filter(([, partOn]) => !partOn);
      if (!on && offParts.length === parts.size) return [feature];
      return offParts.map(([part]) => `${feature}.${part}`);
    });
}

/**
 * The names in `features` that are no feature or part, built in or one of your commands'
 * categories: a typo, which TypeScript can't catch for the names your commands may add.
 */
export function unknownFeaturesOf(
  features: Features | undefined,
  yours: readonly string[],
): string[] {
  const tree = featureTreeOf(yours);
  return Object.keys(features ?? {}).filter((name) => {
    const [feature, part] = featureAndPart(name);
    const parts = tree.get(feature);
    return !parts || (part !== undefined && !parts.includes(part));
  });
}

/** What the commands plugin turns off: its `disabledCategories` and `disabledCommands` settings. */
export interface DisabledSettings {
  readonly disabledCategories: readonly string[];
  readonly disabledCommands: readonly string[];
}

/**
 * The commands plugin's settings for the app's choices: the features that are off, and the
 * single commands `disable` names (the names with a colon). `yours` are your commands' categories.
 */
export function disabledSettingsOf(
  choices: FeatureChoices,
  yours: readonly string[] = [],
): DisabledSettings {
  const commands = new Set((choices.disable ?? []).filter((name) => name.includes(':')));
  return {
    disabledCategories: featuresOffOf(choices, yours),
    disabledCommands: [...commands],
  };
}

/** What people may change by hand: the annotation plugin's `editable` and the form plugin's `fillable`. */
export interface ByHandSettings {
  readonly editable: EditableKinds;
  readonly fillable: FillableFields;
}

/**
 * What people may still change by hand for the app's choices: the annotations and fields of the
 * features left on. A single command turned off leaves them.
 */
export function byHandSettingsOf(
  choices: FeatureChoices,
  yours: readonly string[] = [],
): ByHandSettings {
  const off = featuresOffOf(choices, yours);
  return { editable: stillOn(FEATURE_ANNOTATIONS, off), fillable: stillOn(FEATURE_FIELDS, off) };
}

/**
 * What two `editable` or `fillable` values both allow: `true` is everything, `false` nothing,
 * and a list its names, in the order of `left`. The viewer's own value and the app's setting
 * meet here, so each can only take away.
 */
export function bothAllow<Name extends string>(
  left: boolean | readonly Name[],
  right: boolean | readonly Name[],
): boolean | readonly Name[] {
  if (left === true) return right;
  if (right === true) return left;
  if (left === false || right === false) return false;
  return left.filter((name) => right.includes(name));
}

/** Whether two `editable` or `fillable` values say the same. */
export const sameByHand = (
  left: boolean | readonly string[],
  right: boolean | readonly string[],
): boolean =>
  typeof left === 'boolean' || typeof right === 'boolean'
    ? left === right
    : left.length === right.length && left.every((name, index) => name === right[index]);
