import type { LineEndings } from '../../primitives';
import type { VertexDTO } from '../vertex.shared';

export type PolylineAnnotationDTO = VertexDTO<'polyline'> & {
  lineEndings: LineEndings;
};
