/**
 * @embedpdf/svelte/interaction — pointer input and tools.
 *
 * `<PagePointerSource>` is the one pointer listener per page; the readers are the interaction
 * plugin's API, state, settings and events, and `useToolCursor()` gives a tool its cursors.
 */

// Registration travels with the UI.
export * from '@embedpdf/plugin-interaction';
// The browser helpers live in @embedpdf/web (the plugin has no DOM); they're here too, so app
// code has one import for the feature.
export { createClickCounter, svgCursor, vibrationFeedback, wkFeedback } from '@embedpdf/web';
export type { SvgCursorOptions, ToolCursorImage, ToolCursorSpec } from '@embedpdf/web';

export { default as PagePointerSource } from './interaction/PagePointerSource.svelte';
export {
  useInteraction,
  useInteractionEvent,
  useInteractionSettings,
  useInteractionState,
  useToolCursor,
} from './interaction/readers.svelte';
