import { BasePluginConfig } from '@embedpdf/core';
import {
  AiRuntime,
  AiPipeline,
  AiTask,
  AiBackend,
  ModelLoadProgress,
  PipelineProgress,
} from '@embedpdf/ai';

/**
 * Configuration for the AI Manager plugin.
 */
export interface AiManagerPluginConfig extends BasePluginConfig {
  /** The pre-created AI runtime instance. */
  runtime: AiRuntime;
}

/**
 * State managed by the AI Manager plugin.
 */
export interface AiManagerState {
  /** Currently active backend. */
  backend: AiBackend | null;
  /** Models that are currently loaded. */
  loadedModels: string[];
  /** Models currently being loaded. */
  loadingModels: string[];
}

/**
 * Capability exposed by the AI Manager plugin for other plugins to consume.
 */
export interface AiManagerCapability {
  /**
   * Run a pipeline against the managed AI runtime.
   * Automatically loads the model if not yet loaded.
   */
  run<TInput, TOutput>(
    pipeline: AiPipeline<TInput, TOutput>,
    input: TInput,
  ): AiTask<TOutput, PipelineProgress>;

  /**
   * Load a model by ID. Returns a Task with download progress.
   */
  loadModel(modelId: string): AiTask<void, ModelLoadProgress>;

  /**
   * Unload a model and release its resources.
   */
  unloadModel(modelId: string): void;

  /**
   * Check whether a model is currently loaded and ready.
   */
  isModelLoaded(modelId: string): boolean;

  /**
   * Get the currently active inference backend.
   */
  getBackend(): AiBackend | null;

  /**
   * Get the underlying AI runtime for advanced usage.
   */
  getRuntime(): AiRuntime;
}
