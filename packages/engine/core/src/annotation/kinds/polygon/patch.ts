import type { PdfMeasure, PolygonIntent, ShapeCaptionPatch } from '../../../dto/Measure';
import type { AnnotationPatchBase } from '../../patch-base';
import type { VertexPatchFields } from '../vertex.shared';

export interface PolygonPatch extends AnnotationPatchBase, VertexPatchFields {
  intent?: PolygonIntent | null;
  measure?: PdfMeasure | null;
  caption?: ShapeCaptionPatch | null;
  subtype: 'polygon';
  /** Tri-state (as `interiorColor`): omitted preserves, a value sets, `null` removes `/BE`. */
  cloudyIntensity?: number | null;
}
