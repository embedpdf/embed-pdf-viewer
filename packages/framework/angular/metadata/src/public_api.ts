/**
 * @embedpdf/angular/metadata: a document's properties (title, author, dates) and your own fields.
 *
 *   withMetadata()            the plugin, for provideEmbedPdf()
 *   inject(EpdfMetadata)      fields(), status(), update(), canUpdate(), updated$, …
 *   metadata.custom           your own fields: custom.fields(), custom.update(), custom.updated$, …
 */

// The plugin's types and helpers, so app code has one import for the feature.
export * from '@embedpdf/plugin-metadata';
export * from './metadata';
