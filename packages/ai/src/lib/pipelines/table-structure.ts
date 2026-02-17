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
  IMAGENET_MEAN,
  IMAGENET_STD,
} from '../processing/image';
import { inputNameByHint } from '../processing/tensor';

const SCORE_THRESHOLD = 0.35;
const SHORTEST_EDGE = 800;
const LONGEST_EDGE = 1000;

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
  /** RGBA image data of the cropped table region (with padding). */
  imageData: ImageDataLike;
  /** The page-space bounding box of the table crop (for coordinate mapping back). */
  pageRect: { x1: number; y1: number; x2: number; y2: number };
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
  /** Bounding box in source image coordinates [x1, y1, x2, y2]. */
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
 */
export class TableStructurePipeline implements AiPipeline<
  TableStructureInput,
  TableStructureResult
> {
  readonly modelId = 'table-structure';

  preprocess(
    input: TableStructureInput,
    session: OnnxSession,
    _context: PipelineContext,
  ): OnnxFeeds {
    const { imageData } = input;

    // Resize maintaining aspect ratio
    const targetSize = computeTargetSize(imageData.width, imageData.height);
    const resizedData = resizeImageData(imageData, targetSize.width, targetSize.height);

    // Convert to CHW with ImageNet normalization
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
        // Create a mask tensor of ones
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

  postprocess(outputs: OnnxOutputs, _context: PipelineContext): TableStructureResult {
    const { logits, boxes } = selectTableOutputs(outputs);
    if (!logits || !boxes) {
      return { elements: [] };
    }

    // We need the input size to map coordinates, but we can infer it from the context
    // The pageRect mapping happens in the layout analysis plugin, not here
    const elements = decodeTableStructure(logits, boxes);
    return { elements };
  }
}

// ─── Internal helpers ─────────────────────────────────────────

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

    // Box tensor: last dim is 4
    if ((dims.length === 3 && dims[2] === 4) || (dims.length === 2 && dims[1] === 4)) {
      boxes = tensor;
      continue;
    }

    // Logits tensor: last dim >= 3 (number of classes)
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

function decodeTableStructure(
  logitsTensor: OnnxTensorLike,
  boxesTensor: OnnxTensorLike,
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

    // Detect normalized vs absolute coordinates
    const looksNormalized = Math.max(Math.abs(cx), Math.abs(cy), Math.abs(bw), Math.abs(bh)) <= 2.5;

    let x1: number, y1: number, x2: number, y2: number;
    if (looksNormalized) {
      // cx, cy, w, h in normalized coords — convert to absolute
      // The actual mapping to page coords happens in the plugin layer
      x1 = cx - bw / 2;
      y1 = cy - bh / 2;
      x2 = cx + bw / 2;
      y2 = cy + bh / 2;
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
