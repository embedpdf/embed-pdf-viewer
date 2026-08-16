/**
 * @embedpdf/plugin-selection/internal — the framework/host entry.
 *
 * This is NOT for application code. It exposes the full selection capability
 * surface ({@link SelectionHostCapability}: geometry warming, pointer-gesture
 * intents, the highlight-visibility handshake) plus the wiring pieces a
 * framework adapter or sibling plugin needs (the gesture handler factory, the
 * reducer, the content↔PDF geometry seam). App code imports the public
 * surface from `@embedpdf/plugin-selection`.
 *
 * The token re-exported here is the SAME runtime object as the public one —
 * only its TypeScript type differs (the host lens), so resolving it returns
 * the one cached capability instance with every method visible.
 */
export { SelectionToken } from './types';
export type {
  GlyphPointer,
  SelectionAction,
  SelectionHostCapability,
  SelectionRange,
  SelectionState,
} from './types';
export { createSelectionCapability } from './capability';
export { createTextSelectHandler } from './handler';
export { initialSelectionState, selectionReducer } from './reducer';
export {
  buildSelectionPageGeometry,
  contentPointToPdf,
  toContentSegment,
  toContentTextQuad,
} from './geometry';
export type { SelectionPageGeometry } from './geometry';
