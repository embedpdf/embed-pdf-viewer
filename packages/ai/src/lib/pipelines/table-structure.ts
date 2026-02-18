import { AiPipeline } from './pipeline';
import {
  OnnxFeeds,
  OnnxOutputs,
  OnnxSession,
  OnnxTensorLike,
  PipelineContext,
} from '../runtime/types';
import {
  ImageDataLike,
  imageDataToCHW,
  softmax,
  clamp,
  IMAGENET_MEAN,
  IMAGENET_STD,
} from '../processing/image';
import { inputNameByHint } from '../processing/tensor';

const SCORE_THRESHOLD = 0.35;
const SHORTEST_EDGE = 800;
const LONGEST_EDGE = 1000;
const CROP_MARGIN_RATIO = 0.12;
const CROP_MARGIN_MIN_PX = 24;
const CROP_MARGIN_MAX_PX = 64;

/**
 * Class labels for table structure.
 */
export const TABLE_STRUCTURE_LABELS: Record<number, string> = {
  0: 'table',
  1: 'table_column',
  2: 'table_row',
  3: 'table_column_header',
  4: 'table_projected_row_header',
  5: 'table_spanning_cell',
};

/**
 * Input for the table structure pipeline.
 */
export interface TableStructureInput {
  /** RGBA image data of the cropped table region (unpadded). */
  imageData: ImageDataLike;
}

/**
 * A single table structure element.
 */
export interface TableElement {
  /** Numeric class ID. */
  classId: number;
  /** Human-readable label. */
  label: string;
  /** Confidence score (0 to 1). */
  score: number;
  /** Bounding box in source (unpadded) image pixel coordinates [x1, y1, x2, y2]. */
  bbox: [number, number, number, number];
}

/**
 * Result of table structure analysis.
 */
export interface TableStructureResult {
  elements: TableElement[];
}

/**
 * Pipeline for Table Transformer structure recognition.
 *
 * Accepts an unpadded crop image. Internally pads with white margins
 * (for better edge detection), resizes for the model, runs inference,
 * and maps output coordinates back to the unpadded crop's pixel space.
 */
export class TableStructurePipeline implements AiPipeline<
  TableStructureInput,
  TableStructureResult
> {
  readonly modelId = 'table-structure';

  private sourceWidth = 1;
  private sourceHeight = 1;
  private padding = 0;

  preprocess(
    input: TableStructureInput,
    session: OnnxSession,
    _context: PipelineContext,
  ): OnnxFeeds {
    const { imageData } = input;

    this.sourceWidth = imageData.width;
    this.sourceHeight = imageData.height;
    this.padding = computePadding(imageData.width, imageData.height);

    const paddedData = padImageData(imageData, this.padding);
    const targetSize = computeTargetSize(paddedData.width, paddedData.height);
    const resizedData = resizeImageData(paddedData, targetSize.width, targetSize.height);

    const chw = imageDataToCHW(resizedData, IMAGENET_MEAN, IMAGENET_STD);

    const imageName = inputNameByHint(session.inputNames, ['pixel_values', 'image', 'input'], 0);
    const feeds: OnnxFeeds = {};

    for (const name of session.inputNames) {
      if (name === imageName) {
        feeds[name] = {
          data: chw,
          dims: [1, 3, targetSize.height, targetSize.width],
          type: 'float32',
        };
      } else if (name.toLowerCase().includes('mask')) {
        const count = targetSize.width * targetSize.height;
        const maskData = new Float32Array(count);
        maskData.fill(1);
        feeds[name] = {
          data: maskData,
          dims: [1, targetSize.height, targetSize.width],
          type: 'float32',
        };
      }
    }

    return feeds;
  }

  postprocess(outputs: OnnxOutputs, context: PipelineContext): TableStructureResult {
    const { logits, boxes } = selectTableOutputs(outputs);
    if (!logits || !boxes) {
      return { elements: [] };
    }

    const elements = decodeTableStructure(
      logits,
      boxes,
      this.sourceWidth,
      this.sourceHeight,
      this.padding,
    );

    context.logger.debug('TableStructurePipeline', 'postprocess', {
      elementCount: elements.length,
      sourceWidth: this.sourceWidth,
      sourceHeight: this.sourceHeight,
      padding: this.padding,
      sampleBbox: elements.length > 0 ? elements[0].bbox : null,
    });

    return { elements };
  }
}

// ─── Internal helpers ─────────────────────────────────────────

function computePadding(width: number, height: number): number {
  const margin = Math.round(Math.min(width, height) * CROP_MARGIN_RATIO);
  return clamp(margin, CROP_MARGIN_MIN_PX, CROP_MARGIN_MAX_PX);
}

function padImageData(src: ImageDataLike, pad: number): ImageDataLike {
  const w = src.width + pad * 2;
  const h = src.height + pad * 2;
  const dst = new Uint8ClampedArray(w * h * 4);

  for (let i = 0; i < dst.length; i += 4) {
    dst[i] = 255;
    dst[i + 1] = 255;
    dst[i + 2] = 255;
    dst[i + 3] = 255;
  }

  for (let dy = 0; dy < src.height; dy++) {
    const srcOffset = dy * src.width * 4;
    const dstOffset = ((dy + pad) * w + pad) * 4;
    dst.set(src.data.subarray(srcOffset, srcOffset + src.width * 4), dstOffset);
  }

  return { data: dst, width: w, height: h };
}

function computeTargetSize(width: number, height: number): { width: number; height: number } {
  const shortest = Math.min(width, height);
  const longest = Math.max(width, height);
  const scale = Math.min(SHORTEST_EDGE / shortest, LONGEST_EDGE / longest);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function selectTableOutputs(result: OnnxOutputs): {
  logits: OnnxTensorLike | null;
  boxes: OnnxTensorLike | null;
} {
  let logits: OnnxTensorLike | null = null;
  let boxes: OnnxTensorLike | null = null;

  for (const tensor of Object.values(result)) {
    if (!tensor || !Array.isArray(tensor.dims) || tensor.type !== 'float32') continue;
    const dims = tensor.dims;

    if ((dims.length === 3 && dims[2] === 4) || (dims.length === 2 && dims[1] === 4)) {
      boxes = tensor;
      continue;
    }

    if ((dims.length === 3 && dims[2] >= 3) || (dims.length === 2 && dims[1] >= 3)) {
      const classes = dims.length === 3 ? dims[2] : dims[1];
      const bestClasses = logits ? (logits.dims.length === 3 ? logits.dims[2] : logits.dims[1]) : 0;
      if (!logits || classes > bestClasses) {
        logits = tensor;
      }
    }
  }

  return { logits, boxes };
}

/**
 * Decode model output into table structure elements with coordinates
 * mapped back to the unpadded source crop's pixel space.
 */
function decodeTableStructure(
  logitsTensor: OnnxTensorLike,
  boxesTensor: OnnxTensorLike,
  sourceWidth: number,
  sourceHeight: number,
  padding: number,
): TableElement[] {
  const logits = logitsTensor.data as Float32Array;
  const boxes = boxesTensor.data as Float32Array;
  const logitsDims = logitsTensor.dims;
  const boxesDims = boxesTensor.dims;

  const queryCount = Math.min(
    logitsDims.length === 3 ? logitsDims[1] || 0 : logitsDims[0] || 0,
    boxesDims.length === 3 ? boxesDims[1] || 0 : boxesDims[0] || 0,
  );
  const classCount = logitsDims.length === 3 ? logitsDims[2] || 0 : logitsDims[1] || 0;
  const noObjectClass = classCount - 1;

  const paddedWidth = sourceWidth + padding * 2;
  const paddedHeight = sourceHeight + padding * 2;

  const out: TableElement[] = [];
  for (let i = 0; i < queryCount; i++) {
    const logitsBase = i * classCount;
    const probs = softmax(Array.from(logits.subarray(logitsBase, logitsBase + classCount)));

    let bestClass = -1;
    let bestScore = 0;
    for (let cls = 0; cls < classCount; cls++) {
      if (cls === noObjectClass) continue;
      if (probs[cls] > bestScore) {
        bestClass = cls;
        bestScore = probs[cls];
      }
    }
    if (bestClass < 0 || bestScore < SCORE_THRESHOLD) continue;

    const boxBase = i * 4;
    const cx = boxes[boxBase];
    const cy = boxes[boxBase + 1];
    const bw = boxes[boxBase + 2];
    const bh = boxes[boxBase + 3];

    const looksNormalized = Math.max(Math.abs(cx), Math.abs(cy), Math.abs(bw), Math.abs(bh)) <= 2.5;

    let x1: number, y1: number, x2: number, y2: number;
    if (looksNormalized) {
      x1 = (cx - bw / 2) * paddedWidth - padding;
      y1 = (cy - bh / 2) * paddedHeight - padding;
      x2 = (cx + bw / 2) * paddedWidth - padding;
      y2 = (cy + bh / 2) * paddedHeight - padding;
    } else {
      x1 = cx;
      y1 = cy;
      x2 = bw;
      y2 = bh;
    }

    out.push({
      classId: bestClass,
      label: TABLE_STRUCTURE_LABELS[bestClass] ?? `table_class_${bestClass}`,
      score: bestScore,
      bbox: [x1, y1, x2, y2],
    });
  }

  return out;
}

/**
 * Resize image data (nearest neighbor, pure JS).
 */
function resizeImageData(
  src: ImageDataLike,
  targetWidth: number,
  targetHeight: number,
): ImageDataLike {
  if (src.width === targetWidth && src.height === targetHeight) return src;

  const dst = new Uint8ClampedArray(targetWidth * targetHeight * 4);
  const xRatio = src.width / targetWidth;
  const yRatio = src.height / targetHeight;

  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidth; x++) {
      const srcX = Math.min(Math.floor(x * xRatio), src.width - 1);
      const srcY = Math.min(Math.floor(y * yRatio), src.height - 1);
      const srcIdx = (srcY * src.width + srcX) * 4;
      const dstIdx = (y * targetWidth + x) * 4;
      dst[dstIdx] = src.data[srcIdx];
      dst[dstIdx + 1] = src.data[srcIdx + 1];
      dst[dstIdx + 2] = src.data[srcIdx + 2];
      dst[dstIdx + 3] = src.data[srcIdx + 3];
    }
  }

  return { data: dst, width: targetWidth, height: targetHeight };
}
