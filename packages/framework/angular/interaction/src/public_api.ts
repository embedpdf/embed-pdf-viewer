/**
 * @embedpdf/angular/interaction: the tools and the pointer.
 *
 *   withInteraction(options), withFeedback({ provider })   for provideEmbedPdf()
 *   inject(EpdfInteraction)                                the tools, their cursors, their events
 *   <epdf-page-pointer-source>                             a page's pointer input (a page view mounts it itself)
 */

// The plugin's types and helpers, so app code has one import for the feature.
export * from '@embedpdf/plugin-interaction';
// The browser helpers live in @embedpdf/web (the plugin has no DOM); here for one import.
export { svgCursor, vibrationFeedback, wkFeedback } from '@embedpdf/web';
export type { SvgCursorOptions } from '@embedpdf/web';
export * from './interaction';
export * from './page-pointer-source';
