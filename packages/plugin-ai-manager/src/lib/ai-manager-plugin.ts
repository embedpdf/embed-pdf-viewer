import { BasePlugin, PluginRegistry } from '@embedpdf/core';
import {
  AiRuntime,
  AiPipeline,
  AiTask,
  AiBackend,
  ModelLoadProgress,
  PipelineProgress,
} from '@embedpdf/ai';
import { AiManagerPluginConfig, AiManagerCapability, AiManagerState } from './types';
import {
  AiManagerAction,
  setBackend,
  setModelLoaded,
  setModelUnloaded,
  setModelLoading,
  setModelLoadingDone,
} from './actions';

/**
 * Service plugin that wraps the AiRuntime and exposes it
 * as an 'ai-manager' capability for other plugins to consume.
 *
 * Follows the same pattern as plugin-interaction-manager.
 */
export class AiManagerPlugin extends BasePlugin<
  AiManagerPluginConfig,
  AiManagerCapability,
  AiManagerState,
  AiManagerAction
> {
  static readonly id = 'ai-manager' as const;

  private runtime!: AiRuntime;

  constructor(
    id: string,
    registry: PluginRegistry,
    private config: AiManagerPluginConfig,
  ) {
    super(id, registry);
  }

  async initialize(config: AiManagerPluginConfig): Promise<void> {
    this.runtime = config.runtime;
    if (!this.runtime) {
      throw new Error(
        '[AiManagerPlugin] A runtime instance is required. ' +
          'Pass it via config: createPluginRegistration(AiManagerPluginPackage, { runtime: aiRuntime })',
      );
    }
  }

  protected buildCapability(): AiManagerCapability {
    return {
      run: <TInput, TOutput>(
        pipeline: AiPipeline<TInput, TOutput>,
        input: TInput,
      ): AiTask<TOutput, PipelineProgress> => {
        const task = this.runtime.run(pipeline, input);
        // Track loading state
        if (!this.runtime.isModelLoaded(pipeline.modelId)) {
          this.dispatch(setModelLoading(pipeline.modelId));
          task.wait(
            () => {
              this.dispatch(setModelLoaded(pipeline.modelId));
              this.dispatch(setBackend(this.runtime.getBackend()));
            },
            () => {
              this.dispatch(setModelLoadingDone(pipeline.modelId));
            },
          );
        }
        return task;
      },

      loadModel: (modelId: string): AiTask<void, ModelLoadProgress> => {
        this.dispatch(setModelLoading(modelId));
        const task = this.runtime.loadModel(modelId);
        task.wait(
          () => {
            this.dispatch(setModelLoaded(modelId));
            this.dispatch(setBackend(this.runtime.getBackend()));
          },
          () => {
            this.dispatch(setModelLoadingDone(modelId));
          },
        );
        return task;
      },

      unloadModel: (modelId: string): void => {
        this.runtime.unloadModel(modelId);
        this.dispatch(setModelUnloaded(modelId));
      },

      isModelLoaded: (modelId: string): boolean => {
        return this.runtime.isModelLoaded(modelId);
      },

      getBackend: (): AiBackend | null => {
        return this.runtime.getBackend();
      },

      getRuntime: (): AiRuntime => {
        return this.runtime;
      },
    };
  }

  async destroy(): Promise<void> {
    await this.runtime.destroy();
  }
}
