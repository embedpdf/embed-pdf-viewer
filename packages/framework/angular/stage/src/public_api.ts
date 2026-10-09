/**
 * @embedpdf/angular/stage: `<epdf-stage>` and what goes with it.
 *
 *   withStage(options)                       the plugin, for provideEmbedPdf()
 *   <epdf-stage #stage="epdfStage">          the pages, and the Stage's API
 *   <ng-template epdfPage>, epdfPageChrome   what each page draws, and around it
 *   <epdf-scrollbar>                         a scrollbar you style yourself
 */

// The plugin's types and helpers, so app code has one import for the feature.
export * from '@embedpdf/plugin-stage';
export * from './feature';
export * from './templates';
export * from './stage';
export * from './scrollbar';
