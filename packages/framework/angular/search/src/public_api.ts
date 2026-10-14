/**
 * @embedpdf/angular/search: finding text.
 *
 *   withSearch(options)                   the plugin, for provideEmbedPdf()
 *   inject(EpdfSearch)                    search, the matches, the state, the events
 *   <epdf-search-layer (hitClick)>        the matches on each page, clickable when listened to
 */

// The plugin's types and helpers, so app code has one import for the feature.
export * from '@embedpdf/plugin-search';
export * from './search';
export { EpdfSearchLayer } from './search-layer';
