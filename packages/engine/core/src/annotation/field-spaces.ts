import type { FieldSpace } from './declaration';
import type { AnnotationSubtype } from './subtype';

/** A field kind that holds something measured on the page (every kind but `none`). */
export type MeasuredFieldSpace = Exclude<FieldSpace, 'none'>;

const base = { rect: 'box', actions: 'actions' } as const;

/**
 * The fields of each annotation kind that hold something measured on the
 * page, and what they hold (`FieldSpace`), without zod, for the code that
 * converts values between the file's coordinates and page space in the engines
 * and their workers. `test/annotation/field-spaces.test.ts` keeps it equal to
 * the declarations in `kinds/<kind>/declaration.ts`, and checks that no
 * declared field holds a place on the page without saying so.
 */
export const ANNOTATION_FIELD_SPACES: Readonly<
  Record<AnnotationSubtype, Readonly<Record<string, MeasuredFieldSpace>>>
> = {
  highlight: { ...base, quadPoints: 'quads' },
  underline: { ...base, quadPoints: 'quads' },
  squiggly: { ...base, quadPoints: 'quads' },
  strikeout: { ...base, quadPoints: 'quads' },
  circle: { ...base, box: 'box' },
  square: { ...base, box: 'box' },
  polygon: { ...base, vertices: 'points', captionCenter: 'point', measure: 'measure' },
  polyline: { ...base, vertices: 'points', captionCenter: 'point', measure: 'measure' },
  line: { ...base, linePoints: 'linePoints', measure: 'measure' },
  link: { ...base, target: 'linkTarget' },
  ink: { ...base, inkList: 'strokes' },
  'free-text': { ...base, box: 'box', richText: 'length', calloutLine: 'calloutLine' },
  caret: { ...base, box: 'box' },
  text: base,
  stamp: { ...base, box: 'box' },
  'file-attachment': base,
  widget: { ...base, box: 'box' },
  redact: { ...base, quadPoints: 'quads' },
  popup: base,
  unsupported: base,
};

/**
 * Every measured field by its name, whatever its kind: a name holds the same
 * thing in every kind (`test/annotation/field-spaces.test.ts` keeps it so).
 * An update that leaves out its kind converts by this.
 */
export const ANNOTATION_FIELD_SPACES_BY_NAME: Readonly<Record<string, MeasuredFieldSpace>> =
  Object.assign({}, ...Object.values(ANNOTATION_FIELD_SPACES));
