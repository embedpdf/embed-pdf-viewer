/**
 * @embedpdf/angular/history: undo and redo, one history per open document.
 *
 *   withHistory()            the plugin, for provideEmbedPdf()
 *   inject(EpdfHistory)      undo(), redo(), canUndo(), undoLabel(), undone$, …
 */

// The plugin's types and helpers, so app code has one import for the feature.
export * from '@embedpdf/plugin-history';
export * from './history';
