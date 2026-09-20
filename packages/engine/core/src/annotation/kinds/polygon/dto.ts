import type { PdfMeasurement, PolygonIntent, ShapeDimensionCaption } from '../../../dto/Measure';
import type { VertexDTO } from '../vertex.shared';

export type PolygonAnnotationDTO = VertexDTO<'polygon'> & {
  intent?: PolygonIntent;
  measure?: PdfMeasurement;
  caption?: ShapeDimensionCaption;
  /** `/BE` cloudy border intensity; `null` when the border carries no effect. */
  cloudyIntensity: number | null;
};
