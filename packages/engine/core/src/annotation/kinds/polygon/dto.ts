import type { VertexDTO } from '../vertex.shared';

export type PolygonAnnotationDTO = VertexDTO<'polygon'> & {
  cloudyIntensity?: number;
};
