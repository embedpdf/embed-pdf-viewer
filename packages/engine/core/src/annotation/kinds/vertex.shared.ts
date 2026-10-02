import type { CreateShape, ReadShape, UpdateShape } from '../declaration';
import type { annotationBaseFields, vertexFields } from './shared-fields';
import type { Coordinates, PageCoordinates } from '../../pageSpace/coordinates';

type BaseName = keyof typeof annotationBaseFields;

/** The fields a polygon or polyline adds to the base. */
export type VertexAnnotationFields<C extends Coordinates = PageCoordinates> = Omit<
  ReadShape<typeof vertexFields, C>,
  BaseName
>;
export type VertexDraftFields<C extends Coordinates = PageCoordinates> = Omit<
  CreateShape<typeof vertexFields, C>,
  Exclude<BaseName, 'rect'>
>;
export type VertexPatchFields<C extends Coordinates = PageCoordinates> = Omit<
  UpdateShape<typeof vertexFields, C>,
  Exclude<BaseName, 'rect'>
>;
