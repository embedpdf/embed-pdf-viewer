import type { PdfRect } from '../../../geometry/primitives';
import type { AnnotationPatchBase } from '../../patch-base';
import type { ColorStylePatchFields } from '../style.shared';
import type { FileAttachmentIcon } from './draft';

/**
 * The attached `file` is deliberately NOT patchable — bytes enter once at
 * create; replacing a file is a new attachment (delete + create). Only
 * the icon presentation and base fields can change.
 */
export interface FileAttachmentPatch extends AnnotationPatchBase, ColorStylePatchFields {
  subtype: 'file-attachment';
  rect?: PdfRect;
  icon?: FileAttachmentIcon;
}
