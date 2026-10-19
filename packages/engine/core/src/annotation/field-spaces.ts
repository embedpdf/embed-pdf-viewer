import type { FieldSpace } from './declaration';
import { mapKindFacts } from './kind-facts';
import type { AnnotationSubtype } from './subtype';

/** A field kind that holds something measured on the page (every kind but `none`). */
export type MeasuredFieldSpace = Exclude<FieldSpace, 'none'>;

/**
 * The fields of each annotation kind that hold something measured on the page, and what they
 * hold (`FieldSpace`), without zod, for the code that converts values between the file's
 * coordinates and page space in the engines and their workers. From
 * `kind-facts.generated.ts`; `test/annotation/field-spaces.test.ts` checks that no declared
 * field holds a place on the page without saying so.
 */
export const ANNOTATION_FIELD_SPACES: Readonly<
  Record<AnnotationSubtype, Readonly<Record<string, MeasuredFieldSpace>>>
> = mapKindFacts((facts) => facts.spaces);

/**
 * Every measured field by its name, whatever its kind: a name holds the same
 * thing in every kind (`test/annotation/field-spaces.test.ts` keeps it so).
 * An update that leaves out its kind converts by this.
 */
export const ANNOTATION_FIELD_SPACES_BY_NAME: Readonly<Record<string, MeasuredFieldSpace>> =
  Object.assign({}, ...Object.values(ANNOTATION_FIELD_SPACES));
