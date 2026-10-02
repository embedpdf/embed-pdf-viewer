import type { UpdateShape } from './declaration';
import type { annotationBaseFields } from './kinds/shared-fields';
import type { Coordinates, PageCoordinates } from '../pageSpace/coordinates';

/** The fields every annotation update accepts, whatever its kind. */
export type AnnotationPatchBase<C extends Coordinates = PageCoordinates> = Omit<
  UpdateShape<typeof annotationBaseFields, C>,
  'rect'
>;
