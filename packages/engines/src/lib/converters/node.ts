import type { PdfImage, ImageConversionTypes } from '@embedpdf/models';
import { toArrayBuffer } from '../utils';
import type { ImageDataConverter, LazyImageData } from './types';

// ============================================================================
// Node.js Converters
// ============================================================================

/**
 * Node.js implementation using Sharp
 * This requires the 'sharp' package to be installed
 *
 * @example
 * ```typescript
 * import sharp from 'sharp';
 * import { createNodeImageDataToBufferConverter } from '@embedpdf/engines';
 *
 * const imageDataConverter = createNodeImageDataToBufferConverter(sharp);
 * const engine = new PdfiumEngine(pdfiumModule, { logger, imageDataConverter });
 * ```
 */
export function createNodeImageDataToBufferConverter(
  sharp: any, // Using 'any' to avoid requiring sharp as a dependency
): ImageDataConverter<Buffer> {
  return async (
    getImageData: LazyImageData,
    imageType: ImageConversionTypes = 'image/webp',
    imageQuality?: number,
  ): Promise<Buffer> => {
    const imageData = getImageData();
    const { width, height, data } = imageData;

    // Convert ImageData to Sharp format
    // ImageData uses RGBA format, Sharp expects the same
    let sharpInstance = sharp(Buffer.from(data), {
      raw: {
        width,
        height,
        channels: 4, // RGBA
      },
    });

    // Apply the appropriate format conversion based on imageType
    let buffer: Buffer;
    switch (imageType) {
      case 'image/webp':
        buffer = await sharpInstance
          .webp({
            quality: imageQuality,
          })
          .toBuffer();
        break;
      case 'image/png':
        buffer = await sharpInstance.png().toBuffer();
        break;
      case 'image/jpeg':
        // JPEG doesn't support transparency, so we need to composite onto a white background
        buffer = await sharpInstance
          .flatten({ background: { r: 255, g: 255, b: 255 } }) // Remove alpha channel with white background
          .jpeg({
            quality: imageQuality,
          })
          .toBuffer();
        break;
      default:
        throw new Error(`Unsupported image type: ${imageType}`);
    }

    return buffer;
  };
}

/**
 * Alternative Node.js implementation using canvas (node-canvas)
 * This requires the 'canvas' package to be installed
 *
 * @example
 * ```typescript
 * import { createCanvas } from 'canvas';
 * import { createNodeCanvasImageDataToBlobConverter } from '@embedpdf/engines';
 *
 * const imageDataConverter = createNodeCanvasImageDataToBlobConverter(createCanvas);
 * const engine = new PdfiumEngine(pdfiumModule, { logger, imageDataConverter });
 * ```
 */
export function createNodeCanvasImageDataToBlobConverter(
  createCanvas: any, // Using 'any' to avoid requiring canvas as a dependency
): ImageDataConverter<Buffer> {
  return async (
    getImageData: LazyImageData,
    imageType: ImageConversionTypes = 'image/webp',
    _imageQuality?: number,
  ): Promise<Buffer> => {
    const imageData = getImageData();
    const { width, height } = imageData;

    // Create a canvas and put the image data
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.putImageData(imageData, 0, 0);

    // Convert to buffer and create blob based on the requested type
    let buffer: Buffer;
    switch (imageType) {
      case 'image/webp':
        buffer = canvas.toBuffer('image/webp');
        break;
      case 'image/png':
        buffer = canvas.toBuffer('image/png');
        break;
      case 'image/jpeg':
        buffer = canvas.toBuffer('image/jpeg');
        break;
      default:
        throw new Error(`Unsupported image type: ${imageType}`);
    }

    return buffer;
  };
}

/**
 * Generic Node.js implementation that works with any image processing library
 * that can handle raw RGBA data
 *
 * @example
 * ```typescript
 * const converter = createCustomImageDataToBlobConverter(async (imageData) => {
 *   // Your custom image processing logic here
 *   // Return a Buffer that will be wrapped in a Blob
 *   return processImageWithYourLibrary(imageData);
 * });
 * ```
 */
export function createCustomImageDataToBlobConverter(
  processor: (
    imageData: PdfImage,
    imageType?: ImageConversionTypes,
    imageQuality?: number,
  ) => Promise<Buffer>,
): ImageDataConverter {
  return async (
    getImageData: LazyImageData,
    imageType: ImageConversionTypes = 'image/webp',
    imageQuality?: number,
  ) => {
    const imageData = getImageData();
    const bytes = await processor(imageData, imageType, imageQuality);
    return new Blob([toArrayBuffer(bytes)], { type: imageType });
  };
}

/**
 * Create a custom converter that returns a Buffer
 * @param processor - function to process the image data
 * @param imageType - image type
 * @returns ImageDataToBlobConverter<Buffer>
 */
export function createCustomImageDataToBufferConverter(
  processor: (
    imageData: PdfImage,
    imageType: ImageConversionTypes,
    imageQuality?: number,
  ) => Promise<Buffer>,
): ImageDataConverter<Buffer> {
  return async (
    getImageData: LazyImageData,
    imageType: ImageConversionTypes = 'image/webp',
    imageQuality?: number,
  ): Promise<Buffer> => {
    const imageData = getImageData();
    return await processor(imageData, imageType, imageQuality);
  };
}
