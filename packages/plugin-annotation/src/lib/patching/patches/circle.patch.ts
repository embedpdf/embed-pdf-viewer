import { PdfCircleAnnoObject } from '@embedpdf/models';

import { PatchFunction } from '../patch-registry';
import { calculateRotatedRectAABB, getRectCenter } from '../patch-utils';

export const patchCircle: PatchFunction<PdfCircleAnnoObject> = (orig, ctx) => {
  switch (ctx.type) {
    case 'move':
      // Simple move: just update rect
      if (ctx.changes.rect) {
        return { rect: ctx.changes.rect };
      }
      return ctx.changes;

    case 'resize':
      // Resize: update rect (circle/ellipse doesn't have vertices)
      if (ctx.changes.rect) {
        // If the annotation has rotation, we need to update unrotatedRect too
        if (orig.rotation && orig.rotation !== 0) {
          // The new rect is the AABB, we need to calculate what the unrotated rect would be
          // For now, we'll store the new rect as unrotatedRect and recalculate AABB
          // This is a simplification - full implementation would reverse the rotation
          return {
            rect: ctx.changes.rect,
            unrotatedRect: ctx.changes.rect,
          };
        }
        return { rect: ctx.changes.rect };
      }
      return ctx.changes;

    case 'rotate':
      // Rotation for circle/ellipse: store rotation angle and calculate AABB
      if (ctx.metadata?.rotationAngle !== undefined) {
        const angleDegrees = ctx.metadata.rotationAngle;

        // Use the unrotatedRect if available, otherwise use current rect
        const unrotatedRect = orig.unrotatedRect ?? orig.rect;

        // Calculate the new AABB from the rotated unrotated rect
        const newRect = calculateRotatedRectAABB(unrotatedRect, angleDegrees);

        // Calculate new rotation value (accumulate or set absolute)
        // If rotationAngle is absolute (from interaction), use it directly
        // If it's delta, add to existing rotation
        const newRotation = angleDegrees;

        return {
          rect: newRect,
          rotation: newRotation,
          unrotatedRect: unrotatedRect,
        };
      }
      return ctx.changes;

    case 'property-update':
      // For property updates
      return ctx.changes;

    default:
      return ctx.changes;
  }
};
