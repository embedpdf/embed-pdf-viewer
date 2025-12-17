import type { PdfImage, ImageConversionTypes } from '@embedpdf/models';

// Re-export from models for convenience
export type { ImageConversionTypes } from '@embedpdf/models';

/**
 * Lazy image data getter function
 */
export type LazyImageData = () => PdfImage;

/**
 * Function type for converting ImageData to Blob or other format
 * In browser: uses OffscreenCanvas
 * In Node.js: can use Sharp or other image processing libraries
 */
export type ImageDataConverter<T = Blob> = (
  getImageData: LazyImageData,
  imageType?: ImageConversionTypes,
  imageQuality?: number,
) => Promise<T>;
