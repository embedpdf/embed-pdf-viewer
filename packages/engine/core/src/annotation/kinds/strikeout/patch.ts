import type { AnnotationPatchBase } from '../../patch-base';
import type { StrikeoutIntent } from '../../primitives';
import type { TextMarkupPatchFields } from '../text-markup.shared';

export interface StrikeoutPatch extends AnnotationPatchBase, TextMarkupPatchFields {
  subtype: 'strikeout';
  intent?: StrikeoutIntent;
}
