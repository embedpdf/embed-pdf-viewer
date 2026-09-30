/**
 * What a create that leaves out a data field reads back, kind by kind: the
 * engine's defaults, in one table. The writers take their values from here,
 * and a viewer draws an annotation it is still creating with them, in the
 * colors the engine will write.
 *
 * The type asks for a value for every optional field a read never shows as
 * `null` (a color, a flag, an icon); a field that reads `null` when left out
 * needs none. `test/annotation/defaults.test.ts` checks each value against the
 * field's schema, and the prediction conformance suite checks the table
 * against what both engines create.
 */
import type { Color } from './primitives';
import type { DefaultsOf } from './declaration';
import type { WritableAnnotationDeclaration } from './kinds/declarations';
import type { AnnotationSubtype } from './subtype';

/** A kind's defaults, from its declaration. */
export type AnnotationDefaults<Subtype extends WritableSubtype> = DefaultsOf<
  Extract<WritableAnnotationDeclaration, { subtype: Subtype }>
>;

type WritableSubtype = WritableAnnotationDeclaration['subtype'];

const RED: Color = '#ff0000';
const BLACK: Color = '#000000';
const YELLOW: Color = '#ffff00';

/** Every kind: printed (as Acrobat creates them), no other flag set, normal blending. A popup doesn't print. */
const BASE = {
  invisible: false,
  hidden: false,
  print: true,
  noZoom: false,
  noRotate: false,
  noView: false,
  readOnly: false,
  locked: false,
  toggleNoView: false,
  lockedContents: false,
  blendMode: 'normal',
} as const;

/** Shapes and lines: a solid red line, one point wide. */
const STROKE = {
  ...BASE,
  color: RED,
  opacity: 1,
  strokeWidth: 1,
  borderStyle: 'solid',
} as const;

const NO_ENDINGS = { start: 'none', end: 'none' } as const;

/** Text markup other than a highlight: black. */
const MARKUP = { ...BASE, color: BLACK, opacity: 1 } as const;

export const ANNOTATION_DEFAULTS = {
  square: STROKE,
  circle: STROKE,
  line: { ...STROKE, lineEndings: NO_ENDINGS, captionPosition: 'inline' },
  polygon: STROKE,
  polyline: { ...STROKE, lineEndings: NO_ENDINGS },
  ink: STROKE,
  // A highlight multiplies, so the text shows through its yellow.
  highlight: { ...BASE, blendMode: 'multiply', color: YELLOW, opacity: 1 },
  underline: MARKUP,
  squiggly: MARKUP,
  strikeout: MARKUP,
  caret: { ...BASE, color: RED, opacity: 1 },
  'free-text': {
    ...BASE,
    contents: '',
    intent: 'free-text',
    fontFamily: 'helvetica',
    fontSize: 12,
    textAlign: 'left',
    verticalAlign: 'top',
    color: BLACK,
    fontColor: BLACK,
    opacity: 1,
    strokeWidth: 1,
    borderStyle: 'solid',
  },
  text: { ...BASE, icon: 'note', open: false, color: YELLOW, opacity: 1 },
  'file-attachment': { ...BASE, icon: 'paperclip', color: YELLOW, opacity: 1 },
  link: BASE,
  redact: {
    ...BASE,
    quadPoints: [],
    color: RED,
    opacity: 1,
    repeat: false,
    fontFamily: 'helvetica',
    fontSize: 12,
    fontColor: BLACK,
    textAlign: 'left',
  },
  // A stamp another tool made reads `fit: null`; one the engine creates records its fit.
  stamp: { ...BASE, fit: 'contain', opacity: 1 },
  widget: { ...BASE, strokeWidth: 1, borderStyle: 'solid', textAlign: 'left' },
  popup: { ...BASE, print: false, open: false },
} satisfies { readonly [S in WritableSubtype]: AnnotationDefaults<S> };

/** What a create of `subtype` reads back for each data field it leaves out. */
export function annotationDefaultsOf(
  subtype: AnnotationSubtype,
): Readonly<Record<string, unknown>> {
  return subtype === 'unsupported' ? {} : ANNOTATION_DEFAULTS[subtype];
}
