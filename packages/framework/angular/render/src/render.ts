/**
 * The render plugin's service and feature:
 *
 *   withRender(options)    the plugin, for provideEmbedPdf()
 *   inject(EpdfRender)     pictures of pages on demand (`renderPage`, `renderPages`), redraws
 *                          (`invalidate`, `invalidated$`), whether a page's picture is on screen
 *                          (`getPictureState`, `pictureStateChanged$`), and the settings (`settings()`)
 *   injectPictureState()   whether the picture of the page a component is drawn on is on screen
 */
import { Injectable, type Signal } from '@angular/core';
import {
  CapabilityBinding,
  injectKernelHost,
  injectPage,
  pluginService,
  type EmbedPdfFeature,
} from '@embedpdf/angular/runtime';
import {
  renderPlugin,
  RenderToken,
  type PictureState,
  type RenderCapability,
  type RenderConfig,
} from '@embedpdf/plugin-render';

const NO_PICTURE: PictureState = Object.freeze({ status: 'idle', slow: false });

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
    'getPictureState',
  ],
  events: ['onInvalidated', 'onPictureStateChanged'],
}) {}

/**
 * Whether the picture of the page this component is drawn on is on screen in its view, as a
 * signal: `{ status, slow }`. `status` is `'loading'` until it is, and `slow` turns on once it
 * waited `slowAfterMs` (400 ms): the moment to show a loading indicator. Call it in a component
 * drawn on a page (in `<ng-template epdfPage>` or an `<epdf-page-view>`), in an injection context.
 */
export function injectPictureState(): Signal<PictureState> {
  const page = injectPage('A component that calls injectPictureState()');
  // The render plugin of the page's own document; the same object while the state is the same.
  return new CapabilityBinding<RenderCapability>(
    injectKernelHost('injectPictureState()'),
    () => RenderToken,
    () => page.documentId,
  ).select((render) => render.getPictureState(page.ref, page.view), NO_PICTURE, Object.is);
}

/** The render plugin, with its settings: `withRender({ fullPage: { maxWidth: 1280 } })`. */
export function withRender(options?: RenderConfig): EmbedPdfFeature {
  return { plugins: [renderPlugin(options)], services: [EpdfRender] };
}
