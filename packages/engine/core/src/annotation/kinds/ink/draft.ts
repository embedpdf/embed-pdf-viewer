import type { InkList, PdfRect } from '../../../geometry/primitives';
import type { AnnotationDraftBase } from '../../draft-base';
import type { InkIntent } from '../../primitives';
import type { GeometryStyleDraftFields } from '../style.shared';

export interface InkDraft extends AnnotationDraftBase, GeometryStyleDraftFields {
  subtype: 'ink';
  intent?: InkIntent;
  /** `/InkList` — required (the freehand strokes). */
  inkList: InkList;
  /** `/Rect` bounding box — required (computed by the caller/plugin). */
  rect: PdfRect;
  /** Advisory rotation (deg). */
  rotation?: number;
}
