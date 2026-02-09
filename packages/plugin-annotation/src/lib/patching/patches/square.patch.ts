import { PdfSquareAnnoObject } from '@embedpdf/models';

import { PatchFunction } from '../patch-registry';
import { calculateRotatedRectAABB, resolveRotateRects } from '../patch-utils';

export const patchSquare: PatchFunction<PdfSquareAnnoObject> = (orig, ctx) => {
  switch (ctx.type) {
    case 'move':
      // Simple move: just update rect (and unrotatedRect if rotated)
      if (ctx.changes.rect) {
        if (orig.unrotatedRect) {
          const dx = ctx.changes.rect.origin.x - orig.rect.origin.x;
          const dy = ctx.changes.rect.origin.y - orig.rect.origin.y;
          return {
            rect: ctx.changes.rect,
            unrotatedRect: {
              origin: { x: orig.unrotatedRect.origin.x + dx, y: orig.unrotatedRect.origin.y + dy },
              size: { ...orig.unrotatedRect.size },
            },
          };
        }
        return { rect: ctx.changes.rect };
      }
      return ctx.changes;

    case 'resize':
      // Resize: operates in unrotated space
      if (ctx.changes.rect) {
        // If rotated, ctx.changes.rect is the new unrotatedRect; compute AABB
        if (orig.unrotatedRect) {
          return {
            rect: calculateRotatedRectAABB(ctx.changes.rect, orig.rotation ?? 0),
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

        // Calculate new rotation value
        const newRotation = angleDegrees;

        return {
          ...resolveRotateRects(orig, normalizedUnrotatedRect, angleDegrees),
          rotation: newRotation,
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
