import { OnnxFeeds, OnnxOutputs, OnnxSession, PipelineContext } from '../runtime/types';

/**
 * An AI pipeline defines a complete inference task:
 * model identification, preprocessing, and postprocessing.
 *
 * Users can implement this interface to create custom pipelines
 * for their own ONNX models.
 */
export interface AiPipeline<TInput, TOutput> {
  /** Model identifier (used to resolve URL and manage sessions). */
  readonly modelId: string;

  /**
   * Transform raw input into ONNX session feeds.
   * Receives the session so it can inspect input names.
   */
  preprocess(input: TInput, session: OnnxSession, context: PipelineContext): OnnxFeeds;

  /**
   * Transform ONNX session outputs into the final result type.
   */
  postprocess(outputs: OnnxOutputs, context: PipelineContext): TOutput;
}
