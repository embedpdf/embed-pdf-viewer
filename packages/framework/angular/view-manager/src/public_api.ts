/**
 * @embedpdf/angular/view-manager: panes, each with its own tabs, for documents side by side.
 *
 *   withViewManager()          the plugin, for provideEmbedPdf()
 *   inject(EpdfViewManager)    panes(), focusedPaneId(), splitPane(), setActiveDocument(), …
 *
 * It stays headless: you lay the panes out, draw each pane's tabs from `pane.documentIds`, and
 * put its body in `[epdfDocumentScope]="pane.activeDocumentId"` so its Stage shows that document.
 */

// The plugin's types and helpers, so app code has one import for the feature.
export * from '@embedpdf/plugin-view-manager';
export * from './view-manager';
