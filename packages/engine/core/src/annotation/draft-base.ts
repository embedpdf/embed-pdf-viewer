import type { CreateShape } from './declaration';
import type { annotationBaseFields } from './kinds/shared-fields';
import type { Coordinates, PageCoordinates } from '../pageSpace/coordinates';

/**
 * The fields every annotation create accepts, whatever its kind. `rect` is
 * left to each kind: most require it, text markup derives it from its quads.
 */
export type AnnotationDraftBase<C extends Coordinates = PageCoordinates> = Omit<
  CreateShape<typeof annotationBaseFields, C>,
  'rect'
>;
