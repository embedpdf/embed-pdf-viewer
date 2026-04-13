import type { ImageConversionTypes } from '@embedpdf/models';
import type { ImageDataConverter, LazyImageData } from './types';
import { ImageEncoderWorkerPool } from '../image-encoder';
import { rgbaToBmpBlob } from '../image-encoder/bmp';

// ============================================================================
// Error Classes
// ============================================================================

export class ImageConverterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageConverterError';
  }
}

// ============================================================================
// Browser Converters
// ============================================================================

/**
 * Main-thread Canvas-based image converter
 * Simple and works everywhere, but blocks the main thread during encoding
 *
 * Use this as a fallback when worker-based encoding isn't available
 */
export const browserImageDataToBlobConverter: ImageDataConverter<Blob> = (
  getImageData: LazyImageData,
  imageType: ImageConversionTypes = 'image/png',
  quality?: number,
): Promise<Blob> => {
  const pdfImage = getImageData();

  // Fast path: BMP needs no canvas — just a header prepended to raw pixels
  if (imageType === 'image/bmp') {
    return Promise.resolve(rgbaToBmpBlob(pdfImage.data, pdfImage.width, pdfImage.height));
  }

  if (typeof document === 'undefined') {
    return Promise.reject(
      new ImageConverterError(
        'document is not available. This converter requires a browser environment.',
      ),
    );
  }

  const imageData = new ImageData(pdfImage.data, pdfImage.width, pdfImage.height);

  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    canvas.getContext('2d')!.putImageData(imageData, 0, 0);

    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new ImageConverterError('Canvas toBlob returned null'));
        }
      },
      imageType,
      quality,
    );
  });
};

/**
 * Worker pool image converter using OffscreenCanvas in dedicated workers
 * Non-blocking - encoding happens off the main thread
 *
 * This is the preferred approach for performance
 *
 * @param workerPool - Instance of ImageEncoderWorkerPool
 * @returns ImageDataConverter function with destroy() for cleanup
 */
export function createWorkerPoolImageConverter(
  workerPool: ImageEncoderWorkerPool,
): ImageDataConverter<Blob> {
  const converter: ImageDataConverter<Blob> = (
    getImageData: LazyImageData,
    imageType: ImageConversionTypes = 'image/png',
    quality?: number,
  ): Promise<Blob> => {
    const pdfImage = getImageData();

    // Fast path: BMP needs no worker round-trip
    if (imageType === 'image/bmp') {
      return Promise.resolve(rgbaToBmpBlob(pdfImage.data, pdfImage.width, pdfImage.height));
    }

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

  // Attach destroy method to clean up worker pool
  converter.destroy = () => workerPool.destroy();

  return converter;
}

/**
 * Hybrid converter: Worker pool (OffscreenCanvas) → Main thread Canvas fallback
 *
 * Best of both worlds:
 * - Primary: Non-blocking worker-based encoding with OffscreenCanvas
 * - Fallback: Main-thread Canvas for older browsers without OffscreenCanvas in workers
 *
 * @param workerPool - Instance of ImageEncoderWorkerPool
 * @returns ImageDataConverter function with destroy() for cleanup
 */
export function createHybridImageConverter(
  workerPool: ImageEncoderWorkerPool,
): ImageDataConverter<Blob> {
  const converter: ImageDataConverter<Blob> = async (
    getImageData: LazyImageData,
    imageType: ImageConversionTypes = 'image/png',
    quality?: number,
  ): Promise<Blob> => {
    const pdfImage = getImageData();

    // Fast path: BMP needs no worker round-trip
    if (imageType === 'image/bmp') {
      return rgbaToBmpBlob(pdfImage.data, pdfImage.width, pdfImage.height);
    }

    try {
      // Try worker pool encoding first (OffscreenCanvas in worker)
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
      // Fallback to main-thread Canvas
      console.warn('Worker encoding failed, falling back to main-thread Canvas:', error);
      return browserImageDataToBlobConverter(getImageData, imageType, quality);
    }
  };

  // Attach destroy method to clean up worker pool
  converter.destroy = () => workerPool.destroy();

  return converter;
}
