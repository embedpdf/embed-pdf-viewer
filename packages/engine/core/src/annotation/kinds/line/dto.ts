import type { LinePoints } from '../../../geometry/primitives';
import type { AnnotationBase } from '../../base';
import type { LineEndings } from '../../primitives';
import type { FilledStyleFields } from '../style.shared';

export type LineAnnotationDTO = AnnotationBase & {
  subtype: 'line';
  /** `/L` the two endpoints of the line. */
  linePoints: LinePoints;
  /** `/LE` the start/end line endings. */
  lineEndings: LineEndings;
  /** `/EMBD_Metadata/Rotation` — advisory rotation (deg); the endpoints are
   *  already rotated. No `unrotatedRect`, so it is inert for AP. */
  rotation?: number;
} & FilledStyleFields;
