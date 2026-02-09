import { PdfSquareAnnoObject } from '@embedpdf/models';

import { PatchFunction } from '../patch-registry';
import { calculateRotatedRectAABB, getRectCenter } from '../patch-utils';

export const patchSquare: PatchFunction<PdfSquareAnnoObject> = (orig, ctx) => {
  switch (ctx.type) {
    case 'move':
      // Simple move: just update rect
      if (ctx.changes.rect) {
        return { rect: ctx.changes.rect };
      }
      return ctx.changes;

    case 'resize':
      // Resize: update rect
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
      // Rotation for square/rectangle: store rotation angle and calculate AABB
      if (ctx.metadata?.rotationAngle !== undefined) {
        const angleDegrees = ctx.metadata.rotationAngle;

        // Use the provided unrotatedRect override when available, otherwise fall back to stored value
        const baseUnrotatedRect = ctx.changes.unrotatedRect ?? orig.unrotatedRect ?? orig.rect;
        const normalizedUnrotatedRect = {
          origin: { ...baseUnrotatedRect.origin },
          size: { ...baseUnrotatedRect.size },
        };

        // Calculate the new AABB from the rotated unrotated rect
        const newRect = calculateRotatedRectAABB(normalizedUnrotatedRect, angleDegrees);

        // Calculate new rotation value
        const newRotation = angleDegrees;

        return {
          rect: newRect,
          rotation: newRotation,
          unrotatedRect: normalizedUnrotatedRect,
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
