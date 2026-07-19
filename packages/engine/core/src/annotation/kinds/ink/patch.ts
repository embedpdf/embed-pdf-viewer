import type { InkList, PdfRect } from '../../../geometry/primitives';
import type { AnnotationPatchBase } from '../../patch-base';
import type { InkIntent } from '../../primitives';
import type { GeometryStylePatchFields } from '../style.shared';

export interface InkPatch extends AnnotationPatchBase, GeometryStylePatchFields {
  subtype: 'ink';
  intent?: InkIntent;
  inkList?: InkList;
  rect?: PdfRect;
  rotation?: number;
}
