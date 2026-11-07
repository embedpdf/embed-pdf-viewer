/**
 * @embedpdf/angular/outline: the document's outline (its bookmarks).
 *
 *   withOutline()            the plugin, for provideEmbedPdf()
 *   inject(EpdfOutline)      rows(), current(), canEdit(), activate(), create(), changed$, …
 */

// The plugin's types and helpers, so app code has one import for the feature.
export * from '@embedpdf/plugin-outline';
export * from './outline';
