import type { AnnotationDraftBase } from '../../draft-base';
import type { ShapeDraftFields } from '../shape.shared';

export interface CircleDraft extends AnnotationDraftBase, ShapeDraftFields {
  subtype: 'circle';
}
