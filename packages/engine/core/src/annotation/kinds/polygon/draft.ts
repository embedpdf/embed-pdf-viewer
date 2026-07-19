import type { AnnotationDraftBase } from '../../draft-base';
import type { VertexDraftFields } from '../vertex.shared';

export interface PolygonDraft extends AnnotationDraftBase, VertexDraftFields {
  subtype: 'polygon';
  cloudyIntensity?: number;
}
