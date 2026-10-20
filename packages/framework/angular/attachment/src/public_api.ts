/**
 * @embedpdf/angular/attachment: the files a document carries.
 *
 *   withAttachment()            the plugin, for provideEmbedPdf()
 *   inject(EpdfAttachment)      files(), canAdd(), add(), remove(), download(), changed$, …
 */

// The plugin's types and helpers, so app code has one import for the feature.
export * from '@embedpdf/plugin-attachment';
export * from './attachment';
