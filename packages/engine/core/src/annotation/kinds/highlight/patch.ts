import type { AnnotationPatchBase } from '../../patch-base';
import type { TextMarkupPatchFields } from '../text-markup.shared';

export interface HighlightPatch extends AnnotationPatchBase, TextMarkupPatchFields {
  subtype: 'highlight';
}
