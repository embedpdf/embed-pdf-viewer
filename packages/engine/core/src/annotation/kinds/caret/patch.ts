import type { PdfRect } from '../../../geometry/primitives';
import type { AnnotationPatchBase } from '../../patch-base';
import type { CaretIntent, PdfRectDifferences } from '../../primitives';
import type { ColorStylePatchFields } from '../style.shared';

export interface CaretPatch extends AnnotationPatchBase, ColorStylePatchFields {
  subtype: 'caret';
  intent?: CaretIntent;
  rect?: PdfRect;
  rectDifferences?: PdfRectDifferences;
}
