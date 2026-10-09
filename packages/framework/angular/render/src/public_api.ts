/**
 * @embedpdf/angular/render: the page pictures.
 *
 *   withRender(options)      the plugin, for provideEmbedPdf()
 *   inject(EpdfRender)       pictures on demand, redraws, the settings
 *   <epdf-render-layer>      the picture of each page on a Stage
 */

// The plugin's types and helpers, so app code has one import for the feature.
export * from '@embedpdf/plugin-render';
export * from './render';
export { EpdfRenderLayer } from './render-layer';
