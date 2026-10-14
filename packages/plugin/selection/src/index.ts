/**
 * @embedpdf/plugin-selection — text selection over the engine's text geometry.
 *
 * The public surface: the plugin factory, the capability token (narrowed to
 * the public lens), and the range/read vocabulary. Selection ranges live in
 * character space (half-open `TextRange` — the same space search hits
 * address), geometry needs `doc.text.select`, text extraction needs
 * `doc.text.copy`, and neither permission implies the other.
 *
 * Framework/host plumbing (gesture bracketing, geometry warming, the
 * highlight-visibility handshake) lives behind
 * `@embedpdf/plugin-selection/contract/host`. Clipboard writes live in
 * `@embedpdf/web` — this package is DOM-free.
 */
export { selectionPlugin } from './selection.plugin';
export { selectionState } from './state';
export * from './contract';
// Selection-handle policy (the touch affordance): pure geometry + the drag
// session, consumed by the framework adapters' handle views.
export {
  HANDLE_BAR,
  HANDLE_HEAD,
  HANDLE_PAD,
  armSelectionHandle,
  createSelectionHandleDrag,
  selectionHandleEndpointsOf,
  selectionHandleGeom,
  selectionHandleViewOf,
} from './handles';
export type {
  ArmedSelectionHandle,
  SelectionHandleDragSession,
  SelectionHandleEndpoint,
  SelectionHandleEndpoints,
  SelectionHandleGeom,
  SelectionHandleStage,
  SelectionHandleTarget,
  SelectionHandleView,
} from './handles';
