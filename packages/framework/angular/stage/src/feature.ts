/**
 * `withStage(options)`: the Stage plugin, as a feature of `provideEmbedPdf()`. Give it twice
 * for a second view, with its own `id` and `token`:
 *
 *   provideEmbedPdf({ engine }, withStage(), withStage({ id: 'stage-thumbs', token: ThumbsToken }))
 *
 * `inject(EpdfStageRef)` is the Stage's API: inside `<epdf-stage>` that Stage, anywhere else the
 * main view of the document in scope.
 */
import type { EmbedPdfFeature } from '@embedpdf/angular/runtime';
import { stagePlugin, type StagePluginOptions } from '@embedpdf/plugin-stage';
import { EpdfStageRef } from './stage-ref';

export function withStage(options?: StagePluginOptions): EmbedPdfFeature {
  return { plugins: [stagePlugin(options)], services: [EpdfStageRef] };
}
