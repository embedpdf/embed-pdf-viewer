/**
 * Re-export rotation geometry utilities from @embedpdf/models.
 *
 * These functions used to live here but have been promoted to the shared models
 * package so that both @embedpdf/utils (DragResizeController) and
 * @embedpdf/plugin-annotation (patches) can import from the same source.
 *
 * Existing imports from this module continue to work unchanged.
 */
export {
  rotatePointAround as rotatePointAroundCenter,
  rotateVertices,
  getRectCenter,
  calculateRotatedRectAABBAroundPoint,
  calculateRotatedRectAABB,
  inferRotationCenterFromRects,
} from '@embedpdf/models';
