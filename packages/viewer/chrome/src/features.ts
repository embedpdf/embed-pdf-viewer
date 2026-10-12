/**
 * The viewer's features, and what `disable` and `readOnly` turn off.
 *
 * A feature is a command category: `annotations`, or one of its parts, `annotations.highlight`.
 * Turning a feature off turns off everything under it (the commands plugin matches whole dotted
 * segments). `disable` lists features and single commands in one list, told apart by the colon
 * every command id has; `readOnly` adds the features that change the document.
 */

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
  const categories = new Set<string>();
  const commands = new Set<string>();
  for (const name of disable ?? []) (name.includes(':') ? commands : categories).add(name);
  for (const feature of readOnlyFeaturesOf(readOnly)) categories.add(feature);
  return { disabledCategories: [...categories], disabledCommands: [...commands] };
}
