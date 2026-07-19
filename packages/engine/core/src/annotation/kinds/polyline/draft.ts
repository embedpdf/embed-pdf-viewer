import type { AnnotationDraftBase } from '../../draft-base';
import type { LineEndings } from '../../primitives';
import type { VertexDraftFields } from '../vertex.shared';

export interface PolylineDraft extends AnnotationDraftBase, VertexDraftFields {
  subtype: 'polyline';
  lineEndings?: LineEndings;
}
