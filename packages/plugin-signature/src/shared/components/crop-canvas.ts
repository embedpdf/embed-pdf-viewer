export interface CropResult {
  canvas: HTMLCanvasElement;
  bounds: { x: number; y: number; width: number; height: number };
}

/**
 * Scans a canvas for non-transparent pixels and returns a tightly cropped copy.
 * Returns null if the canvas has no visible content.
 */
export function cropCanvas(source: HTMLCanvasElement, padding = 4): CropResult | null {
  const ctx = source.getContext('2d');
  if (!ctx) return null;

  const { width, height } = source;
  if (width === 0 || height === 0) return null;

  const imageData = ctx.getImageData(0, 0, width, height);
  const { data } = imageData;

  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) return null;

  const cropX = Math.max(0, minX - padding);
  const cropY = Math.max(0, minY - padding);
  const cropW = Math.min(width, maxX + padding + 1) - cropX;
  const cropH = Math.min(height, maxY + padding + 1) - cropY;

  const cropped = document.createElement('canvas');
  cropped.width = cropW;
  cropped.height = cropH;

  const croppedCtx = cropped.getContext('2d');
  if (!croppedCtx) return null;

  croppedCtx.drawImage(source, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

  return {
    canvas: cropped,
    bounds: { x: cropX, y: cropY, width: cropW, height: cropH },
  };
}
