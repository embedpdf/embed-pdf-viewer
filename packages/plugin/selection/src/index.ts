/**
 * @embedpdf/plugin-selection — text selection over the engine's text geometry.
 *
 * The PUBLIC surface: the plugin factory, the capability token (narrowed to
 * the public lens), and the range/read vocabulary. Selection ranges live in
 * CHARACTER space (half-open `TextRange` — the same space search hits
 * address), geometry needs `doc.text.select`, text extraction needs
 * `doc.text.copy`, and neither permission implies the other.
 *
 * Framework/host plumbing (gesture intents, geometry warming, the reducer,
 * the coordinate seam) lives behind `@embedpdf/plugin-selection/internal`.
 * Clipboard writes live in `@embedpdf/web` — this package is DOM-free.
 */
export { selectionPlugin } from './selection.plugin';
export * from './contract';
// Selection-handle policy (the touch affordance): pure geometry + the drag
// session, consumed by the framework adapters' handle views.
export {
  HANDLE_BAR,
  HANDLE_HEAD,
  HANDLE_PAD,
  createSelectionHandleDrag,
  selectionHandleGeom,
} from './handles';
export type {
  SelectionHandleDragSession,
  SelectionHandleEndpoint,
  SelectionHandleGeom,
  SelectionHandleTarget,
  SelectionHandleView,
} from './handles';
