import { ImageConversionTypes } from '@embedpdf/models';
import { ImageDataConverter, LazyImageData } from './types';
import { ImageEncoderWorkerPool } from '../image-encoder';

// ============================================================================
// Error Classes
// ============================================================================

export class OffscreenCanvasError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OffscreenCanvasError';
  }
}

// ============================================================================
// Browser Converters
// ============================================================================

/**
 * Browser-based image converter using OffscreenCanvas in the same thread
 * This is the simplest approach but blocks the thread during encoding
 */
export const browserImageDataToBlobConverter: ImageDataConverter<Blob> = (
  getImageData: LazyImageData,
  imageType: ImageConversionTypes = 'image/webp',
  quality?: number,
): Promise<Blob> => {
  // Check if we're in a browser environment
  if (typeof OffscreenCanvas === 'undefined') {
    return Promise.reject(
      new OffscreenCanvasError(
        'OffscreenCanvas is not available in this environment. ' +
          'This converter is intended for browser use only. ' +
          'Falling back to WASM-based image encoding.',
      ),
    );
  }

  const pdfImage = getImageData();
  const imageData = new ImageData(pdfImage.data, pdfImage.width, pdfImage.height);
  const off = new OffscreenCanvas(imageData.width, imageData.height);
  off.getContext('2d')!.putImageData(imageData, 0, 0);
  return off.convertToBlob({ type: imageType, quality });
};

/**
 * Create an image converter that uses a dedicated worker pool for encoding
 * This prevents blocking the main/PDFium worker thread
 *
 * @param workerPool - Instance of ImageEncoderWorkerPool
 * @returns ImageDataConverter function
 */
export function createWorkerPoolImageConverter(
  workerPool: ImageEncoderWorkerPool,
): ImageDataConverter<Blob> {
  return (
    getImageData: LazyImageData,
    imageType: ImageConversionTypes = 'image/webp',
    quality?: number,
  ): Promise<Blob> => {
    const pdfImage = getImageData();

    // Copy the data since we'll transfer it to another worker
    const dataCopy = new Uint8ClampedArray(pdfImage.data);

    return workerPool.encode(
      {
        data: dataCopy,
        width: pdfImage.width,
        height: pdfImage.height,
      },
      imageType,
      quality,
    );
  };
}

/**
 * Hybrid converter: tries worker pool first, falls back to WASM encoding
 * This provides the best performance with graceful degradation
 *
 * @param workerPool - Instance of ImageEncoderWorkerPool
 * @param wasmFallback - WASM-based encoding function
 * @returns ImageDataConverter function
 */
export function createHybridImageConverter(
  workerPool: ImageEncoderWorkerPool,
  wasmFallback: (
    imageData: { data: Uint8ClampedArray; width: number; height: number },
    imageType: ImageConversionTypes,
    quality?: number,
  ) => Blob,
): ImageDataConverter<Blob> {
  return async (
    getImageData: LazyImageData,
    imageType: ImageConversionTypes = 'image/webp',
    quality?: number,
  ): Promise<Blob> => {
    const pdfImage = getImageData();

    try {
      // Try worker pool encoding first
      const dataCopy = new Uint8ClampedArray(pdfImage.data);
      return await workerPool.encode(
        {
          data: dataCopy,
          width: pdfImage.width,
          height: pdfImage.height,
        },
        imageType,
        quality,
      );
    } catch (error) {
      // Fallback to WASM encoding
      console.warn('Worker pool encoding failed, falling back to WASM:', error);
      return wasmFallback(
        {
          data: pdfImage.data,
          width: pdfImage.width,
          height: pdfImage.height,
        },
        imageType,
        quality,
      );
    }
  };
}
