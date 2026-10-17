/**
 * @embedpdf/angular/page-edit: changing a document's pages.
 *
 *   withPageEdit()          the plugin, for provideEmbedPdf()
 *   inject(EpdfPageEdit)    rotateBy(), reorder(), delete(), insertBlank(), extract(), canEdit(), …
 *
 * The pages themselves are `inject(EpdfDocument).pages()`, which follows every change.
 */

// The plugin's types and helpers, so app code has one import for the feature.
export * from '@embedpdf/plugin-page-edit';
export * from './page-edit';
