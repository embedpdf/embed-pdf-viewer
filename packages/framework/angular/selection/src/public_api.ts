/**
 * @embedpdf/angular/selection: selecting and copying text.
 *
 *   withSelection(options)        the plugin, for provideEmbedPdf() (with withInteraction())
 *   inject(EpdfSelection)         select from code, read the text, the state, the events
 *   <epdf-selection-layer>        the highlight, in each page
 *   <epdf-selection-menu>         your menu next to the selection, inside <epdf-stage>
 *   <epdf-selection-handles>      the handles a finger drags, inside <epdf-stage>
 *   <epdf-selection-clipboard>    Ctrl+C and the browser's Copy menu
 *   copySelection(selection)      the selected text to the clipboard, from your own button
 */

// The plugin's types and helpers, so app code has one import for the feature.
export * from '@embedpdf/plugin-selection';
// The clipboard write lives in @embedpdf/web (the plugin never touches the DOM); re-exported so
// the whole feature is one import.
export { copySelection } from '@embedpdf/web';
export * from './selection';
export { EpdfSelectionLayer } from './selection-layer';
export { EpdfSelectionMenu } from './selection-menu';
export { EpdfSelectionHandles } from './selection-handles';
export { EpdfSelectionClipboard } from './selection-clipboard';
