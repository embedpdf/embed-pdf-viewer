import type { VertexDTO } from '../vertex.shared';

export type PolygonAnnotationDTO = VertexDTO<'polygon'> & {
  /** `/BE` cloudy border intensity; `null` when the border carries no effect. */
  cloudyIntensity: number | null;
};
