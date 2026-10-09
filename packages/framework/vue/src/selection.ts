/**
 * @embedpdf/vue/selection: the Vue surface of `@embedpdf/plugin-selection`.
 *
 * `<SelectionLayer>` paints the selected text on a page, `<SelectionMenu>`
 * floats your menu over it, `<SelectionHandles>` adds the grips touch screens
 * need, and `<SelectionClipboard>` wires Ctrl+C / Cmd+C. The composables are
 * the plugin's four: `useSelection()`, `useSelectionState()`,
 * `useSelectionSettings()` and `useSelectionEvent()`.
 */

// One line per feature: registration travels with the UI.
export * from '@embedpdf/plugin-selection';
// The clipboard write lives in @embedpdf/web (the plugin never touches the
// DOM); re-exported so the whole feature is one import.
export { copySelection } from '@embedpdf/web';
export { default as SelectionLayer } from './selection/SelectionLayer.vue';
export { default as SelectionMenu } from './selection/SelectionMenu.vue';
export { default as SelectionHandles } from './selection/SelectionHandles.vue';
export { default as SelectionClipboard } from './selection/SelectionClipboard.vue';
export {
  useSelection,
  useSelectionEvent,
  useSelectionSettings,
  useSelectionState,
} from './selection/composables';
