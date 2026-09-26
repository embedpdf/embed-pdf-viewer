import type { UpdateShape } from './declaration';
import type { annotationBaseFields } from './kinds/shared-fields';

/** The fields every annotation update accepts, whatever its kind. */
export type AnnotationPatchBase = Omit<UpdateShape<typeof annotationBaseFields>, 'rect'>;
