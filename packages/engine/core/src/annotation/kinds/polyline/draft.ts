import type { PdfMeasure, PolylineIntent, ShapeDimensionCaption } from '../../../dto/Measure';
import type { AnnotationDraftBase } from '../../draft-base';
import type { LineEndings } from '../../primitives';
import type { VertexDraftFields } from '../vertex.shared';

export interface PolylineDraft extends AnnotationDraftBase, VertexDraftFields {
  intent?: PolylineIntent | null;
  measure?: PdfMeasure | null;
  caption?: ShapeDimensionCaption | null;
  subtype: 'polyline';
  lineEndings?: LineEndings;
}
