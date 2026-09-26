import type { CreateShape, ReadShape, UpdateShape } from '../declaration';
import type { annotationBaseFields, shapeFields } from './shared-fields';

type BaseName = keyof typeof annotationBaseFields;

/** The fields a square or circle adds to the base. */
export type ShapeAnnotationFields = Omit<ReadShape<typeof shapeFields>, BaseName>;
export type ShapeDraftFields = Omit<CreateShape<typeof shapeFields>, Exclude<BaseName, 'rect'>>;
export type ShapePatchFields = Omit<UpdateShape<typeof shapeFields>, Exclude<BaseName, 'rect'>>;
