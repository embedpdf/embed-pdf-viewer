import type { AnnotationPatchBase } from '../../patch-base';
import type { TextMarkupPatchFields } from '../text-markup.shared';

export interface UnderlinePatch extends AnnotationPatchBase, TextMarkupPatchFields {
  subtype: 'underline';
}
