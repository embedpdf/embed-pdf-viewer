import type { PdfRect } from '../../../geometry/primitives';
import type { AnnotationPatchBase } from '../../patch-base';
import type { CaretIntent, PdfRectDifferences } from '../../primitives';
import type { ColorStylePatchFields } from '../style.shared';

export interface CaretPatch extends AnnotationPatchBase, ColorStylePatchFields {
  subtype: 'caret';
  intent?: CaretIntent;
  rect?: PdfRect;
  /** Tri-state: omitted preserves, a value sets, `null` removes `/RD`. */
  rectDifferences?: PdfRectDifferences | null;
  /** Tri-state: omitted preserves, `null`/`0` flattens, a value sets (needs the box). */
  rotation?: number | null;
  /** Tri-state: omitted preserves, `null` removes, a value sets. */
  unrotatedRect?: PdfRect | null;
}
