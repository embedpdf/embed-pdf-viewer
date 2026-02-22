import { Task, TaskSequence, Logger, NoopLogger } from '@embedpdf/models';
import {
  AiBackend,
  AiErrorReason,
  AiRuntimeConfig,
  AiTask,
  ModelLoadProgress,
  OnnxFeeds,
  OnnxOutputs,
  OnnxSession,
  PipelineContext,
  PipelineProgress,
  PlatformAdapter,
} from './types';
import { resolveModelUrl } from './model-registry';
import { AiPipeline } from '../pipelines/pipeline';

/**
 * Core AI runtime that manages model sessions and executes pipelines.
 * Platform-agnostic: receives a PlatformAdapter for browser/node differences.
 */
export class AiRuntime {
  private sessions = new Map<string, OnnxSession>();
  private loadingTasks = new Map<string, AiTask<void, ModelLoadProgress>>();
  private activeBackend: AiBackend | null = null;
  private config: Required<Pick<AiRuntimeConfig, 'cache'>> & AiRuntimeConfig;
  private readonly logger: Logger;

  constructor(
    private platform: PlatformAdapter,
    config: AiRuntimeConfig = {},
  ) {
    this.config = {
      cache: true,
      ...config,
    };
    this.logger = config.logger ?? new NoopLogger();
  }

  /**
   * Get the currently active backend.
   */
  getBackend(): AiBackend | null {
    return this.activeBackend;
  }

  /**
   * Check whether a model is currently loaded.
   */
  isModelLoaded(modelId: string): boolean {
    return this.sessions.has(modelId);
  }

  /**
   * Load a model by ID. Returns a Task with download progress.
   * If the model is already loaded, resolves immediately.
   * If a load is in progress, returns the existing task.
   */
  loadModel(modelId: string): AiTask<void, ModelLoadProgress> {
    if (this.sessions.has(modelId)) {
      const task = new Task<void, AiErrorReason, ModelLoadProgress>();
      task.resolve(undefined);
      return task;
    }

    const existing = this.loadingTasks.get(modelId);
    if (existing) return existing;

    const task = new Task<void, AiErrorReason, ModelLoadProgress>();
    this.loadingTasks.set(modelId, task);

    this.doLoadModel(modelId, task).catch(() => {
      // Error already handled via task.reject
    });

    return task;
  }

  /**
   * Unload a model and release its session.
   */
  unloadModel(modelId: string): void {
    const session = this.sessions.get(modelId);
    if (session) {
      session.release().catch(() => {});
      this.sessions.delete(modelId);
    }
    this.loadingTasks.delete(modelId);
  }

  /**
   * Run a pipeline against a loaded model.
   * Automatically loads the model if not yet loaded.
   * Model loading progress is forwarded to the returned task.
   */
  run<TInput, TOutput>(
    pipeline: AiPipeline<TInput, TOutput>,
    input: TInput,
  ): AiTask<TOutput, PipelineProgress> {
    const task = new Task<TOutput, AiErrorReason, PipelineProgress>();
    const seq = new TaskSequence(task);

    seq.execute(
      async () => {
        await seq.runWithProgress(
          () => this.loadModel(pipeline.modelId),
          (p) =>
            p.stage === 'downloading'
              ? {
                  stage: 'downloading-model' as const,
                  modelId: p.modelId,
                  loaded: p.loaded,
                  total: p.total,
                }
              : { stage: 'creating-session' as const, modelId: p.modelId },
        );
        await this.executePipeline(pipeline, input, task);
      },
      (err) => ({
        type: 'model-load-failed' as const,
        modelId: pipeline.modelId,
        message: String(err),
      }),
    );

    return task;
  }

  /**
   * Destroy the runtime and release all sessions.
   */
  async destroy(): Promise<void> {
    for (const [, session] of this.sessions) {
      await session.release().catch(() => {});
    }
    this.sessions.clear();
    this.loadingTasks.clear();
    await this.platform.destroy();
  }

  // ─── Private ────────────────────────────────────────────────

  private async doLoadModel(
    modelId: string,
    task: Task<void, AiErrorReason, ModelLoadProgress>,
  ): Promise<void> {
    try {
      const url = resolveModelUrl(modelId, this.config.models?.[modelId]?.url);
      const backend = await this.platform.resolveBackend(this.config.backend ?? 'auto');
      this.logger.debug(
        'AiRuntime',
        'loadModel',
        `Loading model "${modelId}" with backend "${backend}"`,
        { url },
      );

      const session = await this.platform.loadModel(
        url,
        { backend },
        { cache: this.config.cache },
        (progress) => {
          const mapped: ModelLoadProgress =
            progress.stage === 'downloading'
              ? { stage: 'downloading', modelId, loaded: progress.loaded, total: progress.total }
              : { stage: 'creating-session', modelId };
          task.progress(mapped);
          this.config.onProgress?.(mapped);
        },
      );

      this.sessions.set(modelId, session);
      this.activeBackend = backend;
      this.loadingTasks.delete(modelId);
      this.logger.debug('AiRuntime', 'loadModel', `Model "${modelId}" loaded successfully`);
      task.resolve(undefined);
    } catch (err) {
      this.loadingTasks.delete(modelId);
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error('AiRuntime', 'loadModel', `Failed to load model "${modelId}": ${message}`);
      task.reject({
        type: 'model-load-failed',
        modelId,
        message,
      });
    }
  }

  private async executePipeline<TInput, TOutput>(
    pipeline: AiPipeline<TInput, TOutput>,
    input: TInput,
    task: Task<TOutput, AiErrorReason, PipelineProgress>,
  ): Promise<void> {
    const session = this.sessions.get(pipeline.modelId);
    if (!session) {
      task.reject({
        type: 'inference-failed',
        message: `Model "${pipeline.modelId}" not loaded`,
      });
      return;
    }

    const context: PipelineContext = {
      backend: this.activeBackend ?? 'wasm',
      logger: this.logger,
    };

    try {
      task.progress({ stage: 'preprocessing' });
      this.logger.perf('AiRuntime', 'pipeline', 'preprocess', 'Begin', pipeline.modelId);
      const feeds: OnnxFeeds = pipeline.preprocess(input, session, context);
      this.logger.perf('AiRuntime', 'pipeline', 'preprocess', 'End', pipeline.modelId);

      task.progress({ stage: 'inference' });
      this.logger.perf('AiRuntime', 'pipeline', 'inference', 'Begin', pipeline.modelId);
      const outputs: OnnxOutputs = (await session.run(feeds)) as OnnxOutputs;
      this.logger.perf('AiRuntime', 'pipeline', 'inference', 'End', pipeline.modelId);

      task.progress({ stage: 'postprocessing' });
      this.logger.perf('AiRuntime', 'pipeline', 'postprocess', 'Begin', pipeline.modelId);
      const result = pipeline.postprocess(outputs, context);
      this.logger.perf('AiRuntime', 'pipeline', 'postprocess', 'End', pipeline.modelId);

      task.resolve(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        'AiRuntime',
        'pipeline',
        `Inference failed for "${pipeline.modelId}": ${message}`,
      );
      task.reject({
        type: 'inference-failed',
        message,
      });
    }
  }
}
