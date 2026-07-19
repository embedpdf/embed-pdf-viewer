import type { PdfRect } from '../../../geometry/primitives';
import type { AnnotationPatchBase } from '../../patch-base';
import type { ColorStylePatchFields } from '../style.shared';
import type { NoteIcon } from './draft';

export interface TextPatch extends AnnotationPatchBase, ColorStylePatchFields {
  subtype: 'text';
  rect?: PdfRect;
  icon?: NoteIcon;
}
