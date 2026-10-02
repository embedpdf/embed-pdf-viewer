/**
 * @embedpdf/svelte/selection — text selection.
 *
 * `<SelectionLayer>` paints the highlight on each page; `<SelectionMenu>` floats over a settled
 * selection; `<SelectionHandles>` are the touch handles in a Stage's overlay;
 * `<SelectionClipboard>` wires Ctrl+C / Cmd+C. The readers are the plugin's four:
 * `useSelection()`, `useSelectionState()`, `useSelectionSettings()` and `useSelectionEvent()`.
 */

// Registration travels with the UI.
export * from '@embedpdf/plugin-selection';
// The clipboard write lives in @embedpdf/web (the plugin has no DOM); it's here too, so app code
// has one import for the feature.
export { copySelection } from '@embedpdf/web';

export { default as SelectionLayer } from './selection/SelectionLayer.svelte';
export { default as SelectionMenu } from './selection/SelectionMenu.svelte';
export { default as SelectionHandles } from './selection/SelectionHandles.svelte';
export { default as SelectionClipboard } from './selection/SelectionClipboard.svelte';
export type {
  SelectionClipboardProps,
  SelectionHandlesProps,
  SelectionMenuProps,
} from './selection/props';
export {
  useSelection,
  useSelectionEvent,
  useSelectionSettings,
  useSelectionState,
} from './selection/readers.svelte';
