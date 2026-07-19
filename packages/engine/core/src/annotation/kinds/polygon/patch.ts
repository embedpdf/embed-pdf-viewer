import type { AnnotationPatchBase } from '../../patch-base';
import type { VertexPatchFields } from '../vertex.shared';

export interface PolygonPatch extends AnnotationPatchBase, VertexPatchFields {
  subtype: 'polygon';
  cloudyIntensity?: number;
}
