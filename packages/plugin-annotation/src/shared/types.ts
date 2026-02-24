import { PdfAnnotationObject, Position } from '@embedpdf/models';

/**
 * Interface for vertex configuration - handles annotation-specific vertex logic
 */
export interface VertexConfig<T extends PdfAnnotationObject> {
  /** Extract vertices from annotation - handles different vertex formats */
  extractVertices: (annotation: T) => Position[];
  /** Transform annotation when vertices change */
  transformAnnotation: (annotation: T, vertices: Position[]) => Partial<T>;
}
