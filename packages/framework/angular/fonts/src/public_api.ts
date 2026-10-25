/**
 * @embedpdf/angular/fonts: a document's fonts, and the programs a browser draws text in them with.
 *
 *   withFonts()                the plugin, for provideEmbedPdf()
 *   inject(EpdfFonts)          list(), status(), getFontCss(), getPaintFonts(), resolve(), …
 *   injectFontMounts(() => …)  mount the programs a part of your template draws text in
 */

// The plugin's types and helpers, so app code has one import for the feature.
export * from '@embedpdf/plugin-fonts';
export * from './fonts';
export { injectFontMounts } from '@embedpdf/angular/runtime';
