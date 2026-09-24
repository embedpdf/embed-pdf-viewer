import type { CreateShape, ReadShape, UpdateShape } from '../declaration';
import type { annotationBaseFields, vertexFields } from './shared-fields';

type BaseName = keyof typeof annotationBaseFields;

/** The fields a polygon or polyline adds to the base. */
export type VertexAnnotationFields = Omit<ReadShape<typeof vertexFields>, BaseName>;
export type VertexDraftFields = Omit<CreateShape<typeof vertexFields>, Exclude<BaseName, 'rect'>>;
export type VertexPatchFields = Omit<UpdateShape<typeof vertexFields>, Exclude<BaseName, 'rect'>>;
