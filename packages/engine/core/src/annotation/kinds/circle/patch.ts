import type { AnnotationPatchBase } from '../../patch-base';
import type { ShapePatchFields } from '../shape.shared';

export interface CirclePatch extends AnnotationPatchBase, ShapePatchFields {
  subtype: 'circle';
}
