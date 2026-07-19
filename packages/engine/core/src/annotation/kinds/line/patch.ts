import type { LinePoints, PdfRect } from '../../../geometry/primitives';
import type { AnnotationPatchBase } from '../../patch-base';
import type { LineEndings } from '../../primitives';
import type { FilledStylePatchFields } from '../style.shared';

export interface LinePatch extends AnnotationPatchBase, FilledStylePatchFields {
  subtype: 'line';
  linePoints?: LinePoints;
  rect?: PdfRect;
  lineEndings?: LineEndings;
  rotation?: number;
}
