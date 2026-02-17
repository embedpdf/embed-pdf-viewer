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
  clamp,
  IMAGENET_MEAN,
  IMAGENET_STD,
} from '../processing/image';
import { inputNameByHint } from '../processing/tensor';

const MODEL_INPUT_SIZE = 800;

/**
 * Class labels from PP-DocLayoutV3 id2label config.
 * Source: https://huggingface.co/PaddlePaddle/PP-DocLayoutV3_safetensors/blob/main/config.json
 */
export const LAYOUT_LABELS: Record<number, string> = {
  0: 'abstract',
  1: 'algorithm',
  2: 'aside_text',
  3: 'chart',
  4: 'content',
  5: 'formula',
  6: 'doc_title',
  7: 'figure_title',
  8: 'footer',
  9: 'footer',
  10: 'footnote',
  11: 'formula_number',
  12: 'header',
  13: 'header',
  14: 'image',
  15: 'formula',
  16: 'number',
  17: 'paragraph_title',
  18: 'reference',
  19: 'reference_content',
  20: 'seal',
  21: 'table',
  22: 'text',
  23: 'text',
  24: 'vision_footnote',
};

/**
 * Input for the layout detection pipeline.
 */
export interface LayoutDetectionInput {
  /** RGBA image data (from canvas or sharp). */
  imageData: ImageDataLike;
  /** Original source width in pixels (before any resize to model input). */
  sourceWidth: number;
  /** Original source height in pixels. */
  sourceHeight: number;
}

/**
 * A single layout detection result.
 */
export interface LayoutDetection {
  /** Unique index of this detection. */
  id: number;
  /** Numeric class ID from the model. */
  classId: number;
  /** Human-readable label. */
  label: string;
  /** Confidence score (0 to 1). */
  score: number;
  /** Bounding box in source image coordinates [x1, y1, x2, y2]. */
  bbox: [number, number, number, number];
  /** 4-point polygon in source image coordinates. */
  polygon: [[number, number], [number, number], [number, number], [number, number]];
  /** Reading order (assigned after sorting). */
  readingOrder: number;
}

/**
 * Pipeline for PP-DocLayoutV3 layout detection.
 */
export class LayoutDetectionPipeline implements AiPipeline<
  LayoutDetectionInput,
  LayoutDetection[]
> {
  readonly modelId = 'layout-detection';

  preprocess(
    input: LayoutDetectionInput,
    session: OnnxSession,
    _context: PipelineContext,
  ): OnnxFeeds {
    const { imageData } = input;

    // Resize to MODEL_INPUT_SIZE x MODEL_INPUT_SIZE
    const resizedData = resizeImageData(imageData, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);

    // Convert to CHW with ImageNet normalization
    const chw = imageDataToCHW(resizedData, IMAGENET_MEAN, IMAGENET_STD);

    const hScale = MODEL_INPUT_SIZE / input.sourceHeight;
    const wScale = MODEL_INPUT_SIZE / input.sourceWidth;

    // Build feeds using session input names
    const imageName = inputNameByHint(session.inputNames, ['image'], 0);
    const shapeName = inputNameByHint(session.inputNames, ['im_shape', 'shape'], 1);
    const scaleName = inputNameByHint(session.inputNames, ['scale_factor', 'scale'], 2);

    return {
      [imageName]: {
        data: chw,
        dims: [1, 3, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE],
        type: 'float32',
      },
      [shapeName]: {
        data: new Float32Array([MODEL_INPUT_SIZE, MODEL_INPUT_SIZE]),
        dims: [1, 2],
        type: 'float32',
      },
      [scaleName]: {
        data: new Float32Array([hScale, wScale]),
        dims: [1, 2],
        type: 'float32',
      },
    };
  }

  postprocess(outputs: OnnxOutputs, _context: PipelineContext): LayoutDetection[] {
    const selected = selectDetectionOutput(outputs);
    if (!selected) return [];

    const bboxCount = selectBboxCountOutput(outputs);
    const rawAll = parseModelOutput(selected);
    const raw =
      Number.isInteger(bboxCount) && bboxCount! >= 0
        ? rawAll.slice(0, Math.min(bboxCount!, rawAll.length))
        : rawAll;

    return raw;
  }
}

// ─── Internal helpers ─────────────────────────────────────────

interface RawDetection {
  classId: number;
  score: number;
  polygon: [[number, number], [number, number], [number, number], [number, number]];
}

function selectDetectionOutput(result: OnnxOutputs): OnnxTensorLike | null {
  let best: OnnxTensorLike | null = null;

  for (const tensor of Object.values(result)) {
    if (!tensor || !Array.isArray(tensor.dims)) continue;
    const isFloat = tensor.type === 'float32';
    const is2d = tensor.dims.length === 2;
    const cols = is2d ? tensor.dims[1] : 0;
    if (isFloat && is2d && cols >= 6) {
      if (!best || cols > best.dims[1]) {
        best = tensor;
      }
    }
  }

  return best;
}

function selectBboxCountOutput(result: OnnxOutputs): number | null {
  for (const tensor of Object.values(result)) {
    if (!tensor || !Array.isArray(tensor.dims)) continue;
    const isInt = tensor.type === 'int32' || tensor.type === 'int64';
    if (isInt && tensor.dims.length === 1 && tensor.data?.length >= 1) {
      const value = Number(tensor.data[0]);
      if (Number.isFinite(value) && value >= 0) return value;
    }
  }
  return null;
}

function parseModelOutput(tensor: OnnxTensorLike): LayoutDetection[] {
  const data = tensor.data as Float32Array;
  const dims = tensor.dims;

  let rows = 0;
  let cols = 8;
  if (dims.length === 2) {
    rows = dims[0];
    cols = dims[1];
  } else if (dims.length === 3) {
    rows = dims[1];
    cols = dims[2];
  } else {
    rows = Math.floor(data.length / 8);
  }

  const out: LayoutDetection[] = [];
  for (let i = 0; i < rows; i++) {
    const base = i * cols;
    if (base + 5 >= data.length) break;

    const classId = Math.round(data[base]);
    const score = data[base + 1];

    if (!Number.isFinite(score) || score < 0 || score > 1.5) continue;

    const polygon: [[number, number], [number, number], [number, number], [number, number]] = [
      [data[base + 2], data[base + 3]],
      [data[base + 4], data[base + 3]],
      [data[base + 4], data[base + 5]],
      [data[base + 2], data[base + 5]],
    ];

    const xs = polygon.map((p) => p[0]);
    const ys = polygon.map((p) => p[1]);
    const bbox: [number, number, number, number] = [
      Math.min(...xs),
      Math.min(...ys),
      Math.max(...xs),
      Math.max(...ys),
    ];

    out.push({
      id: i,
      classId,
      label: LAYOUT_LABELS[classId] ?? `class_${classId}`,
      score,
      bbox,
      polygon,
      readingOrder: 0,
    });
  }

  // Assign reading order
  const sorted = [...out].sort((a, b) => {
    const acy = (a.bbox[1] + a.bbox[3]) / 2;
    const bcy = (b.bbox[1] + b.bbox[3]) / 2;
    if (Math.abs(acy - bcy) < 10) return a.bbox[0] - b.bbox[0];
    return acy - bcy;
  });
  sorted.forEach((det, idx) => {
    det.readingOrder = idx;
  });

  return out;
}

/**
 * Resize image data to target dimensions using bilinear interpolation.
 * This is a pure-JS implementation that works in both browser and Node.
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
