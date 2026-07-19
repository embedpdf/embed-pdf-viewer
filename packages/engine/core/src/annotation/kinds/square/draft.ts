import type { AnnotationDraftBase } from '../../draft-base';
import type { ShapeDraftFields } from '../shape.shared';

export interface SquareDraft extends AnnotationDraftBase, ShapeDraftFields {
  subtype: 'square';
}
