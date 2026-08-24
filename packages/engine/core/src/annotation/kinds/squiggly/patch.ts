import type { AnnotationPatchBase } from '../../patch-base';
import type { TextMarkupPatchFields } from '../text-markup.shared';

export interface SquigglyPatch extends AnnotationPatchBase, TextMarkupPatchFields {
  subtype: 'squiggly';
}
