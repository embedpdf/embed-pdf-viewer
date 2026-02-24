import type { PdfImage, ImageConversionTypes } from '@embedpdf/models';

// Re-export from models for convenience
export type { ImageConversionTypes } from '@embedpdf/models';

/**
 * Lazy image data getter function
 */
export type LazyImageData = () => PdfImage;

/**
 * Callable interface for converting ImageData to Blob or other format.
 * In browser: uses OffscreenCanvas
 * In Node.js: can use Sharp or other image processing libraries
 *
 * The optional `destroy()` method allows converters with resources (like worker pools)
 * to clean up when the engine is destroyed.
 */
export interface ImageDataConverter<T = Blob> {
  (
    getImageData: LazyImageData,
    imageType?: ImageConversionTypes,
    imageQuality?: number,
  ): Promise<T>;

  /**
   * Optional cleanup method. Called when PdfEngine.destroy() is invoked.
   * Converters with resources (e.g., worker pools) should implement this to release them.
   */
  destroy?: () => void;
}
