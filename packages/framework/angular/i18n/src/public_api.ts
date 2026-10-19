/**
 * @embedpdf/angular/i18n: the viewer in the user's language.
 *
 *   withI18n(options)        the plugin, for provideEmbedPdf()
 *   inject(EpdfI18n)         the languages, as signals, calls and streams
 *   {{ 'key' | epdfT }}      the EpdfTPipe: a string in the current language
 */

// The plugin's types and helpers (`negotiateLocale`), so app code has one import for the feature.
export * from '@embedpdf/plugin-i18n';
export * from './i18n';
