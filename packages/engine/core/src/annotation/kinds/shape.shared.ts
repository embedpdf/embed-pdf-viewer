import type { CreateShape, ReadShape, UpdateShape } from '../declaration';
import type { annotationBaseFields, shapeFields } from './shared-fields';
import type { Coordinates, PageCoordinates } from '../../pageSpace/coordinates';

type BaseName = keyof typeof annotationBaseFields;

/** The fields a square or circle adds to the base. */
export type ShapeAnnotationFields<C extends Coordinates = PageCoordinates> = Omit<
  ReadShape<typeof shapeFields, C>,
  BaseName
>;
export type ShapeDraftFields<C extends Coordinates = PageCoordinates> = Omit<
  CreateShape<typeof shapeFields, C>,
  Exclude<BaseName, 'rect'>
>;
export type ShapePatchFields<C extends Coordinates = PageCoordinates> = Omit<
  UpdateShape<typeof shapeFields, C>,
  Exclude<BaseName, 'rect'>
>;
