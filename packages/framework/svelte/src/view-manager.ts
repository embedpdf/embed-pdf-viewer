/**
 * @embedpdf/svelte/view-manager — panes, each with its own tabs.
 *
 * It stays headless: it gives you the panes, and you lay them out (split, grid, stacked), draw
 * each pane's tab strip over `pane.documentIds`, and wrap its body in
 * `<DocumentScope id={pane.activeDocumentId}>` so its Stage shows that pane's document. The
 * readers are the plugin's: `useViewManager()` (the API), `useViewManagerState()` and
 * `useViewManagerEvent()`.
 */

// Registration travels with the UI.
export * from '@embedpdf/plugin-view-manager';

export {
  useViewManager,
  useViewManagerEvent,
  useViewManagerState,
} from './view-manager/readers';
