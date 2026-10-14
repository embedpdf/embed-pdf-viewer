/**
 * @embedpdf/angular/redaction: mark text and areas, review the marks, remove the content.
 *
 *   withRedaction(options)     the plugin, for provideEmbedPdf()
 *   inject(EpdfRedaction)      markArea(), markMatches(), pending(), pendingOn(page),
 *                              applyAll(), pendingCount(), applying(), applied$, …
 */

// The plugin's types and helpers, so app code has one import for the feature.
export * from '@embedpdf/plugin-redaction';
export * from './redaction';
