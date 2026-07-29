import type { AnnotationPatchBase } from '../../patch-base';
import type { VertexPatchFields } from '../vertex.shared';

export interface PolygonPatch extends AnnotationPatchBase, VertexPatchFields {
  subtype: 'polygon';
  /** Tri-state (as `interiorColor`): omitted preserves, a value sets, `null` removes `/BE`. */
  cloudyIntensity?: number | null;
}
