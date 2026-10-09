/**
 * @embedpdf/angular/actions: what a PDF may do by itself (links, buttons, form calculations,
 * scripts), and how your app shows what its actions ask for.
 *
 *   withActions(config)        the plugin, for provideEmbedPdf()
 *   withActionsUi(handlers)    the browser's defaults for websites, printing and alerts, or yours
 *   inject(EpdfActions)        executeNamed(), execute(), the checks, the settings, the streams
 */

// The plugin's types and helpers, so app code has one import for the feature.
export * from '@embedpdf/plugin-actions';
export * from './actions';
