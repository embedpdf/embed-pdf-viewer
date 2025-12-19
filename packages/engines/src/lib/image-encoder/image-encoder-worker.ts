/**
 * Dedicated worker for image encoding operations
 * Offloads OffscreenCanvas.convertToBlob() from the main PDFium worker
 */

export interface EncodeImageRequest {
  id: string;
  type: 'encode';
  data: {
    imageData: {
      data: Uint8ClampedArray;
      width: number;
      height: number;
    };
    imageType: 'image/png' | 'image/jpeg' | 'image/webp';
    quality?: number;
  };
}

export interface EncodeImageResponse {
  id: string;
  type: 'result' | 'error';
  data: Blob | { message: string };
}

/**
 * Encode ImageData to Blob using OffscreenCanvas
 */
async function encodeImage(
  imageData: { data: Uint8ClampedArray; width: number; height: number },
  imageType: 'image/png' | 'image/jpeg' | 'image/webp',
  quality?: number,
): Promise<Blob> {
  if (typeof OffscreenCanvas === 'undefined') {
    throw new Error('OffscreenCanvas is not available in this worker environment');
  }

  const { data, width, height } = imageData;

  // Create ImageData from the raw data
  // Need to create a new Uint8ClampedArray to avoid type issues with ArrayBufferLike
  const imgData = new ImageData(new Uint8ClampedArray(data), width, height);

  // Create OffscreenCanvas and render
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Failed to get 2D context from OffscreenCanvas');
  }

  ctx.putImageData(imgData, 0, 0);

  // Convert to blob
  return canvas.convertToBlob({ type: imageType, quality });
}

/**
 * Handle incoming encoding requests
 */
self.onmessage = async (event: MessageEvent<EncodeImageRequest>) => {
  const request = event.data;

  if (request.type !== 'encode') {
    return;
  }

  try {
    const { imageData, imageType, quality } = request.data;

    // Perform the encoding
    const blob = await encodeImage(imageData, imageType, quality);

    // Send back the result
    const response: EncodeImageResponse = {
      id: request.id,
      type: 'result',
      data: blob,
    };

    self.postMessage(response);
  } catch (error) {
    // Send back error
    const response: EncodeImageResponse = {
      id: request.id,
      type: 'error',
      data: {
        message: error instanceof Error ? error.message : String(error),
      },
    };

    self.postMessage(response);
  }
};
