import type { PdfMeasure, PolygonIntent, ShapeDimensionCaption } from '../../../dto/Measure';
import type { AnnotationDraftBase } from '../../draft-base';
import type { VertexDraftFields } from '../vertex.shared';

export interface PolygonDraft extends AnnotationDraftBase, VertexDraftFields {
  intent?: PolygonIntent | null;
  measure?: PdfMeasure | null;
  caption?: ShapeDimensionCaption | null;
  subtype: 'polygon';
  cloudyIntensity?: number | null;
}
