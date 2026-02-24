/**
 * ImageNet normalization constants.
 */
export const IMAGENET_MEAN = [0.485, 0.456, 0.406] as const;
export const IMAGENET_STD = [0.229, 0.224, 0.225] as const;

/**
 * Minimal image data interface (works in both browser and Node).
 */
export interface ImageDataLike {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/**
 * Convert RGBA ImageData to a CHW float32 tensor with ImageNet normalization.
 * Output shape: [1, 3, height, width]
 */
export function imageDataToCHW(
  imageData: ImageDataLike,
  mean: readonly [number, number, number] = IMAGENET_MEAN,
  std: readonly [number, number, number] = IMAGENET_STD,
): Float32Array {
  const { data, width, height } = imageData;
  const plane = width * height;
  const chw = new Float32Array(3 * plane);

  let src = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const r = data[src] / 255;
      const g = data[src + 1] / 255;
      const b = data[src + 2] / 255;
      const i = y * width + x;
      chw[i] = (r - mean[0]) / std[0];
      chw[plane + i] = (g - mean[1]) / std[1];
      chw[2 * plane + i] = (b - mean[2]) / std[2];
      src += 4;
    }
  }

  return chw;
}

/**
 * Clamp a value to [min, max].
 */
export function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

/**
 * Softmax over a float array.
 */
export function softmax(values: Float32Array | number[]): Float32Array {
  let max = -Infinity;
  for (let i = 0; i < values.length; i++) {
    if (values[i] > max) max = values[i];
  }
  const exps = new Float32Array(values.length);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    const e = Math.exp(values[i] - max);
    exps[i] = e;
    sum += e;
  }
  if (sum > 0) {
    for (let i = 0; i < exps.length; i++) {
      exps[i] /= sum;
    }
  }
  return exps;
}
