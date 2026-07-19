import type { AnnotationPatchBase } from '../../patch-base';
import type { ShapePatchFields } from '../shape.shared';

export interface SquarePatch extends AnnotationPatchBase, ShapePatchFields {
  subtype: 'square';
}
