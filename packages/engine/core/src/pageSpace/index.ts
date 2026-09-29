/**
 * Page space: every position measured from the top-left of a page's visible
 * box, y down (`geometry/pageSpace.ts`). The conversions between it and the
 * file's coordinates for everything the engine takes and returns, and the
 * geometry helpers for page-space values.
 */

export type { Coordinates, PageCoordinates, PdfCoordinates } from './coordinates';
export type { DestinationBox, VisibleBoxOf } from './destinations';
export {
  mapActionNode,
  mapActionTree,
  mapAnnotationActions,
  mapDocumentActions,
  mapFieldActions,
  mapLinkTarget,
  mapPageActions,
  pageDestinationOf,
  pdfDestinationOf,
} from './destinations';
export {
  pageAnnotationDraftOf,
  pageAnnotationOf,
  pageAnnotationPatchOf,
  pdfAnnotationDraftOf,
  pdfAnnotationOf,
  pdfAnnotationPatchOf,
} from './annotations';
export { pageLayoutOf, pageListOf, pageSpaceBoxesOf, visibleBoxesOf } from './pages';
export { createTextLayout, pageGeometryOf, pageSearchSliceOf, pageTextSegmentOf } from './text';
export { pageAppearancesOf, pdfRenderTargetOf } from './rendering';
export {
  pageFieldActionsOf,
  pageFormFieldOf,
  pageFormSnapshotOf,
  pdfFormFieldDraftOf,
  pdfWidgetPlacementOf,
} from './forms';
export { pageMeasureOf, pageViewportsOf, pdfMeasureOf } from './measure';
export type { PagePointTurn } from './helpers';
export {
  annotationOfDraft,
  appearanceTurnOf,
  applyAnnotationPatch,
  drawnPointsOf,
  pageGlyphLooseBounds,
  pageGlyphLooseQuad,
  pagePointsBounds,
  pagePointTurned,
  pagePointUnturned,
  pageQuadBounds,
  pageQuadCorners,
  pageQuadFromCorners,
  pageTurnOfDrawn,
  pageTurnOfUpright,
  resolveAnnotationDraft,
  resolveAnnotationPatch,
  shapeForRect,
} from './helpers';
