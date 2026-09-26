import type { PdfMeasurement, PolylineIntent, ShapeDimensionCaption } from '../../../dto/Measure';
import type { LineEndings } from '../../primitives';
import type { VertexDTO } from '../vertex.shared';

export type PolylineAnnotationDTO = VertexDTO<'polyline'> & {
  intent?: PolylineIntent;
  measure?: PdfMeasurement;
  caption?: ShapeDimensionCaption;
  lineEndings: LineEndings;
};
