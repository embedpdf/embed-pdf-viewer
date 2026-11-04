/**
 * @embedpdf/angular/render: the page pictures.
 *
 *   withRender(options)      the plugin, for provideEmbedPdf()
 *   inject(EpdfRender)       pictures on demand, redraws, the settings
 *   <epdf-render-layer>      the picture of each page on a Stage
 *   <epdf-snapshot-layer>    the snapshot tool's box on each page
 *   <epdf-snapshot-menu>     your UI by the snapshot, in <epdf-stage>
 *   injectPictureState()     whether a page's picture is on screen yet, for a loading indicator
 */

// The plugin's types and helpers, so app code has one import for the feature.
export * from '@embedpdf/plugin-render';
export * from './render';
export { EpdfRenderLayer } from './render-layer';
export { EpdfSnapshotLayer } from './snapshot-layer';
export { EpdfSnapshotMenu } from './snapshot-menu';
