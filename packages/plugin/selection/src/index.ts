/**
 * @embedpdf/plugin-selection — text selection over the engine's text geometry.
 *
 * Standard layout: types.ts · geometry.ts (pure bridge) · reducer.ts ·
 * capability.ts · handler.ts · selection.plugin.ts. The first real client of the
 * interaction hub, and the first consumer of the PDF↔content geometry bridge.
 */
export { selectionPlugin } from './selection.plugin';
export { createSelectionCapability } from './capability';
export { createTextSelectHandler } from './handler';
export { initialSelectionState, selectionReducer } from './reducer';
export { buildPageText, glyphAt, rectsForRange, expandToWord, expandToLine } from './geometry';
export type { GlyphInfo, RunInfo, PageText } from './geometry';
export { SelectionToken } from './types';
export type {
  GlyphPointer,
  SelectionAction,
  SelectionCapability,
  SelectionEndpoint,
  SelectionRange,
  SelectionSnapshot,
  SelectionState,
} from './types';
