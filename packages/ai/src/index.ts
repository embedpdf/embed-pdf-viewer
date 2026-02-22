// Core runtime
export { AiRuntime } from './lib/runtime/ai-runtime';
export type {
  AdapterLoadProgress,
  AiBackend,
  AiErrorReason,
  AiRuntimeConfig,
  AiTask,
  ModelConfig,
  ModelLoadProgress,
  OnnxFeeds,
  OnnxOutputs,
  OnnxSession,
  OnnxTensorLike,
  PipelineContext,
  PipelineProgress,
  PlatformAdapter,
  SessionOptions,
  TensorDescriptor,
  TensorType,
} from './lib/runtime/types';

// Pipelines
export type { AiPipeline } from './lib/pipelines/pipeline';
export { LayoutDetectionPipeline } from './lib/pipelines/layout-detection';
export type { LayoutDetection, LayoutDetectionInput } from './lib/pipelines/layout-detection';
export { TableStructurePipeline } from './lib/pipelines/table-structure';
export type {
  TableStructureInput,
  TableStructureResult,
  TableElement,
} from './lib/pipelines/table-structure';

// Processing utilities
export {
  imageDataToCHW,
  clamp,
  softmax,
  IMAGENET_MEAN,
  IMAGENET_STD,
} from './lib/processing/image';
export type { ImageDataLike } from './lib/processing/image';
export { inputNameByHint } from './lib/processing/tensor';

// Model registry
export { DEFAULT_MODEL_URLS, resolveModelUrl } from './lib/runtime/model-registry';
