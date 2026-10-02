/**
 * `withStage(options)`: the Stage plugin, as a feature of `provideEmbedPdf()`. Give it twice
 * for a second view, with its own `id` and `token`:
 *
 *   provideEmbedPdf({ engine }, withStage(), withStage({ id: 'stage-thumbs', token: ThumbsToken }))
 *
 * The Stage has no service: `<epdf-stage>` is its API.
 */
import type { EmbedPdfFeature } from '@embedpdf/angular/runtime';
import { stagePlugin, type StagePluginOptions } from '@embedpdf/plugin-stage';

export function withStage(options?: StagePluginOptions): EmbedPdfFeature {
  return { plugins: [stagePlugin(options)] };
}
