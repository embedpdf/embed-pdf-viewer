/**
 * The render plugin's service and feature:
 *
 *   withRender(options)    the plugin, for provideEmbedPdf()
 *   inject(EpdfRender)     pictures of pages on demand (`renderPage`, `renderPages`), redraws
 *                          (`invalidate`, `invalidated$`), and the settings (`settings()`)
 */
import { Injectable } from '@angular/core';
import { pluginService, type EmbedPdfFeature } from '@embedpdf/angular/runtime';
import { renderPlugin, RenderToken, type RenderConfig } from '@embedpdf/plugin-render';

/**
 * Pictures of pages, apart from the Stage: a thumbnail, a page at an exact width, every page in
 * batches. `invalidate()` redraws pages, `invalidated$` tells you when they were, and
 * `settings()` / `updateSettings()` are the picture budget and tiles.
 */
@Injectable({ providedIn: 'root' })
export class EpdfRender extends pluginService({
  name: 'EpdfRender',
  feature: 'withRender()',
  token: RenderToken,
  methods: [
    'canRender',
    'renderPage',
    'renderThumbnail',
    'renderPages',
    'getRenderPolicy',
    'getRenderEpoch',
    'invalidate',
  ],
  events: ['onInvalidated'],
}) {}

/** The render plugin, with its settings: `withRender({ fullPage: { maxWidth: 1280 } })`. */
export function withRender(options?: RenderConfig): EmbedPdfFeature {
  return { plugins: [renderPlugin(options)], services: [EpdfRender] };
}
