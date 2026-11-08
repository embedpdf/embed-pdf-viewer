import { createHash } from 'node:crypto';
import {
  LINE_BREAKS_VERSION,
  PAGE_TEXT_VERSION,
  SEARCH_FOLD_VERSION,
} from '@embedpdf/engine-core/runtime';
import { CACHED_READ_KINDS, type CachedReadKind } from '@embedpdf/engine-core/wire';

/**
 * The version of how this server draws pages, annotations and fields: the
 * runtime and the engine's painters. Raise it when a release draws the test
 * PDFs differently, pixel for pixel.
 */
export const DRAWING_VERSION = 1;

/** The rules this server computes cached reads with, each beside the code it versions. */
const RULES = {
  drawing: DRAWING_VERSION,
  pageText: PAGE_TEXT_VERSION,
  searchFold: SEARCH_FOLD_VERSION,
  lineBreaks: LINE_BREAKS_VERSION,
} as const;

/** A rule, or `fonts`: the fingerprint of the server's fonts, which changes with `CLOUDPDF_FONTS`. */
type Input = keyof typeof RULES | 'fonts';

/**
 * One number per kind for the fields its answers have. Raise a kind's number
 * in the change that adds a field to its answers, so answers with the field
 * get new URLs.
 */
const FIELDS: Readonly<Record<CachedReadKind, number>> = {
  manifest: 1,
  // 2: a page's viewports (3.1).
  layout: 2,
  text: 1,
  geometry: 1,
  render: 1,
  annotationAppearances: 1,
  widgetAppearances: 1,
  annotations: 1,
  annotationsAll: 1,
  annotationsExport: 1,
  form: 1,
  formExport: 1,
  metadata: 1,
  outline: 1,
  attachments: 1,
  actions: 1,
  fonts: 2,
  search: 1,
  signatures: 1,
  analysis: 1,
  download: 1,
};

/** What each kind is computed with besides the document; a kind not listed reads none. */
const INPUTS: Partial<Readonly<Record<CachedReadKind, readonly Input[]>>> = {
  render: ['drawing', 'fonts'],
  annotationAppearances: ['drawing', 'fonts'],
  widgetAppearances: ['drawing', 'fonts'],
  fonts: ['fonts'],
  text: ['pageText'],
  search: ['pageText', 'searchFold'],
  annotations: ['lineBreaks'],
  annotationsAll: ['lineBreaks'],
};

/**
 * This server's engine value for each kind of cached read (`/head`'s
 * `engine`): a digest of the kind's fields number and of the rules and fonts
 * it is computed with. The release version is never an input, so a deploy or
 * a restart that raises nothing keeps every cached answer
 * (`docs/conventions/api-evolution.md`).
 */
export class EngineValues {
  private computed: Promise<Readonly<Record<CachedReadKind, string>>> | null = null;

  constructor(private readonly serverFonts: { fingerprint(): Promise<string> }) {}

  /** Read once; a failed read of the fonts is tried again on the next call. */
  values(): Promise<Readonly<Record<CachedReadKind, string>>> {
    this.computed ??= this.serverFonts
      .fingerprint()
      .then(engineValuesFor)
      .catch((error: unknown) => {
        this.computed = null;
        throw error;
      });
    return this.computed;
  }

  /** This server's engine value for `kind`. */
  async of(kind: CachedReadKind): Promise<string> {
    return (await this.values())[kind];
  }
}

/** The engine values of a server whose fonts have `fontsFingerprint`. */
export function engineValuesFor(fontsFingerprint: string): Record<CachedReadKind, string> {
  const current: Record<Input, string | number> = { ...RULES, fonts: fontsFingerprint };
  const values = {} as Record<CachedReadKind, string>;
  for (const kind of CACHED_READ_KINDS) {
    const inputs = (INPUTS[kind] ?? []).map((input) => `${input}=${current[input]}`);
    values[kind] = createHash('sha256')
      .update([`${kind}=${FIELDS[kind]}`, ...inputs].join('\n'))
      .digest('hex')
      .slice(0, 12);
  }
  return values;
}
