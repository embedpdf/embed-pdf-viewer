/**
 * @embedpdf/plugin-selection/internal — the framework/host entry.
 *
 * This is NOT for application code. It preserves framework implementation
 * helpers and re-exports the full selection host capability. Sibling plugins
 * use `@embedpdf/plugin-selection/contract/host`; `/internal` is an
 * API-visibility boundary, not a bundle-purity boundary.
 *
 * The token re-exported here is the SAME runtime object as the public one —
 * only its TypeScript type differs (the host lens), so resolving it returns
 * the one cached capability instance with every method visible.
 */
export * from './host-contract';
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
