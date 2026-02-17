import { Task } from '@embedpdf/models';

/**
 * Error reasons for AI operations.
 */
export type AiErrorReason =
  | { type: 'model-load-failed'; modelId: string; message: string }
  | { type: 'inference-failed'; message: string }
  | { type: 'backend-unavailable'; attempted: string[]; message: string }
  | { type: 'cancelled'; message: string };

/**
 * Progress during model loading (download + session creation).
 */
export type ModelLoadProgress =
  | { stage: 'downloading'; modelId: string; loaded: number; total: number }
  | { stage: 'creating-session'; modelId: string };

/**
 * Progress during pipeline execution, including model loading.
 */
export type PipelineProgress =
  | { stage: 'downloading-model'; modelId: string; loaded: number; total: number }
  | { stage: 'creating-session'; modelId: string }
  | { stage: 'preprocessing' }
  | { stage: 'inference' }
  | { stage: 'postprocessing' };

/**
 * Convenience alias mirroring PdfTask.
 */
export type AiTask<R, P = unknown> = Task<R, AiErrorReason, P>;

/**
 * Supported inference backends.
 */
export type AiBackend = 'webgpu' | 'wasm' | 'cpu';

/**
 * Configuration for the AI runtime.
 */
export interface AiRuntimeConfig {
  /** Preferred backend. 'auto' tries webgpu then wasm. */
  backend?: AiBackend | 'auto';
  /** Whether to cache downloaded models. Defaults to true. */
  cache?: boolean;
  /** Per-model source overrides. */
  models?: Record<string, ModelConfig>;
  /** Global progress callback for model loading. */
  onProgress?: (progress: ModelLoadProgress) => void;
  /**
   * Path prefix where onnxruntime WASM files are served.
   * Only relevant for browser environments. When set, configures
   * `ort.env.wasm.wasmPaths` so ONNX Runtime can locate its WASM binaries.
   */
  wasmPaths?: string;
}

/**
 * Per-model configuration.
 */
export interface ModelConfig {
  /** Custom URL to fetch the model from. If not set, uses default source. */
  url?: string;
}

/**
 * Common tensor element types matching ONNX Runtime's DataTypeMap keys.
 */
export type TensorType =
  | 'float32'
  | 'float64'
  | 'int8'
  | 'int16'
  | 'int32'
  | 'int64'
  | 'uint8'
  | 'uint16'
  | 'uint32'
  | 'uint64'
  | 'bool'
  | 'string';

/**
 * Platform-agnostic description of a tensor.
 * Pipelines return these; platform adapters convert them to real ORT Tensor instances.
 */
export interface TensorDescriptor {
  data: Float32Array | Int32Array | BigInt64Array | Uint8Array;
  dims: readonly number[];
  type: TensorType;
}

/**
 * Feed dictionary for ONNX session — maps input names to tensor descriptors.
 */
export type OnnxFeeds = Record<string, TensorDescriptor>;

/**
 * ONNX inference session abstraction.
 */
export interface OnnxSession {
  inputNames: string[];
  outputNames: string[];
  run(feeds: OnnxFeeds): Promise<OnnxOutputs>;
  release(): Promise<void>;
}

/**
 * Minimal tensor-like interface for ONNX outputs.
 */
export interface OnnxTensorLike {
  data: Float32Array | Int32Array | BigInt64Array | Uint8Array;
  dims: readonly number[];
  type: TensorType;
}

/**
 * Context passed to pipeline pre/post processing.
 */
export interface PipelineContext {
  /** The active backend. */
  backend: AiBackend;
}

/**
 * Output dictionary from ONNX session.
 */
export type OnnxOutputs = Record<string, OnnxTensorLike>;

/**
 * Progress reported by PlatformAdapter.loadModel().
 */
export type AdapterLoadProgress =
  | { stage: 'downloading'; loaded: number; total: number }
  | { stage: 'creating-session' };

/**
 * Platform-specific operations that differ between browser and Node.
 *
 * The web adapter uses onnxruntime-web/webgpu for WebGPU support and
 * enables `ort.env.wasm.proxy` for WASM to offload heavy operations
 * to ONNX Runtime's internal web worker, preventing UI freezes.
 * The Node.js adapter runs everything directly on the main thread.
 */
export interface PlatformAdapter {
  /** Detect the best available backend for this platform. */
  resolveBackend(preferred: AiBackend | 'auto'): Promise<AiBackend>;

  /**
   * Fetch, cache, and create an ONNX session in a single call.
   * The entire lifecycle stays inside the adapter (and inside the
   * web worker for browser environments), avoiding large buffer transfers.
   */
  loadModel(
    url: string,
    options: SessionOptions,
    config: { cache: boolean },
    onProgress?: (progress: AdapterLoadProgress) => void,
  ): Promise<OnnxSession>;

  /** Release all resources held by this adapter. */
  destroy(): Promise<void>;
}

/**
 * Options when creating an ONNX session.
 */
export interface SessionOptions {
  backend: AiBackend;
}
