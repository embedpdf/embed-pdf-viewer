import type { PdfMeasure, PolylineIntent, ShapeCaptionPatch } from '../../../dto/Measure';
import type { AnnotationPatchBase } from '../../patch-base';
import type { LineEndings } from '../../primitives';
import type { VertexPatchFields } from '../vertex.shared';

export interface PolylinePatch extends AnnotationPatchBase, VertexPatchFields {
  intent?: PolylineIntent | null;
  measure?: PdfMeasure | null;
  caption?: ShapeCaptionPatch | null;
  subtype: 'polyline';
  lineEndings?: LineEndings;
}
