import type {
  PdfMeasure,
  LineIntent,
  LineDimensionCaption,
  LineLeader,
} from '../../../dto/Measure';
import type { LinePoints, PdfRect } from '../../../geometry/primitives';
import type { AnnotationDraftBase } from '../../draft-base';
import type { LineEndings } from '../../primitives';
import type { FilledStyleDraftFields } from '../style.shared';

export interface LineDraft extends AnnotationDraftBase, FilledStyleDraftFields {
  intent?: LineIntent | null;
  measure?: PdfMeasure | null;
  caption?: LineDimensionCaption | null;
  leader?: LineLeader | null;
  subtype: 'line';
  /** `/L` the two endpoints — required. */
  linePoints: LinePoints;
  /** `/Rect` bounding box — required (computed by the caller/plugin). */
  rect: PdfRect;
  lineEndings?: LineEndings;
  /** Advisory rotation (deg). */
  rotation?: number | null;
}
