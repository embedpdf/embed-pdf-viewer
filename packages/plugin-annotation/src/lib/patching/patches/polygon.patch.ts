import { expandRect, PdfPolygonAnnoObject, rectFromPoints } from '@embedpdf/models';

import { PatchFunction } from '../patch-registry';
import {
  compensateRotatedVertexEdit,
  calculateRotatedRectAABB,
  calculateRotatedRectAABBAroundPoint,
  resolveAnnotationRotationCenter,
  resolveRotateRects,
  resolveVertexEditRects,
} from '../patch-utils';

export const patchPolygon: PatchFunction<PdfPolygonAnnoObject> = (orig, ctx) => {
  // Handle different transformation types
  switch (ctx.type) {
    case 'vertex-edit':
      // Polygon vertex editing: update vertices and recalculate rect
      if (ctx.changes.vertices && ctx.changes.vertices.length) {
        const pad = orig.strokeWidth / 2;
        const rawVertices = ctx.changes.vertices;
        const rawRect = expandRect(rectFromPoints(rawVertices), pad);
        const compensated = compensateRotatedVertexEdit(orig, rawVertices, rawRect);
        const rect = expandRect(rectFromPoints(compensated), pad);
        return {
          ...resolveVertexEditRects(orig, rect),
          vertices: compensated,
        };
      }
      return ctx.changes;

    case 'move':
      // Simple move: translate all vertices
      if (ctx.changes.rect) {
        const dx = ctx.changes.rect.origin.x - orig.rect.origin.x;
        const dy = ctx.changes.rect.origin.y - orig.rect.origin.y;
        const moved = orig.vertices.map((p) => ({ x: p.x + dx, y: p.y + dy }));

        const result: Partial<PdfPolygonAnnoObject> = {
          rect: ctx.changes.rect,
          vertices: moved,
        };

        // Also translate unrotatedRect if the annotation is rotated
        if (orig.unrotatedRect) {
          result.unrotatedRect = {
            origin: { x: orig.unrotatedRect.origin.x + dx, y: orig.unrotatedRect.origin.y + dy },
            size: { ...orig.unrotatedRect.size },
          };
        }

        return result;
      }
      return ctx.changes;

    case 'resize':
      // Complex resize with scaling -- operates in unrotated space
      if (ctx.changes.rect) {
        const oldRect = orig.unrotatedRect ?? orig.rect;
        const newRect = ctx.changes.rect;
        let scaleX = newRect.size.width / oldRect.size.width;
        let scaleY = newRect.size.height / oldRect.size.height;

        // Enforce minimum size to avoid collapse
        const minSize = 10;
        if (newRect.size.width < minSize || newRect.size.height < minSize) {
          scaleX = Math.max(scaleX, minSize / oldRect.size.width);
          scaleY = Math.max(scaleY, minSize / oldRect.size.height);
          ctx.changes.rect = {
            origin: newRect.origin,
            size: {
              width: oldRect.size.width * scaleX,
              height: oldRect.size.height * scaleY,
            },
          };
        }

        // Optional: Uniform scaling (preserve aspect ratio)
        if (ctx.metadata?.maintainAspectRatio) {
          const minScale = Math.min(scaleX, scaleY);
          scaleX = minScale;
          scaleY = minScale;
          ctx.changes.rect!.size = {
            width: oldRect.size.width * minScale,
            height: oldRect.size.height * minScale,
          };
        }

        // Scale vertices relative to old rect and apply to new rect
        const scaledVertices = orig.vertices.map((vertex) => ({
          x: ctx.changes.rect!.origin.x + (vertex.x - oldRect.origin.x) * scaleX,
          y: ctx.changes.rect!.origin.y + (vertex.y - oldRect.origin.y) * scaleY,
        }));

        const result: Partial<PdfPolygonAnnoObject> = {
          vertices: scaledVertices,
        };

        // If rotated, ctx.changes.rect is the new unrotatedRect; compute AABB
        if (orig.unrotatedRect) {
          result.unrotatedRect = ctx.changes.rect;
          result.rect = calculateRotatedRectAABB(ctx.changes.rect, orig.rotation ?? 0);
        } else {
          result.rect = ctx.changes.rect;
        }

        return result;
      }
      return ctx.changes;
    case 'rotate':
      // Store rotation angle and compute AABB -- vertices are NOT rotated at runtime
      if (ctx.metadata?.rotationAngle !== undefined) {
        const angleDegrees = ctx.metadata.rotationAngle;

        // Use the provided unrotatedRect override when available, otherwise fall back to stored value
        const baseUnrotatedRect = ctx.changes.unrotatedRect ?? orig.unrotatedRect ?? orig.rect;
        const normalizedUnrotatedRect = {
          origin: { ...baseUnrotatedRect.origin },
          size: { ...baseUnrotatedRect.size },
        };

        return {
          ...resolveRotateRects(orig, normalizedUnrotatedRect, angleDegrees),
          rotation: angleDegrees,
        };
      }
      return ctx.changes;

    case 'property-update':
      // For property updates that might affect the rect (strokeWidth changes)
      if (ctx.changes.strokeWidth !== undefined) {
        const merged = { ...orig, ...ctx.changes };
        // Recalculate rect using the same logic as deriveRect
        const pad = merged.strokeWidth / 2;
        const tightRect = expandRect(rectFromPoints(merged.vertices), pad);

        // If rotated, tightRect is the new unrotatedRect; compute the visible AABB
        // Use the original rotation center so the annotation doesn't jump
        if (orig.unrotatedRect) {
          return {
            ...ctx.changes,
            unrotatedRect: tightRect,
            rect: calculateRotatedRectAABBAroundPoint(
              tightRect,
              orig.rotation ?? 0,
              resolveAnnotationRotationCenter(orig),
            ),
          };
        }
        return { ...ctx.changes, rect: tightRect };
      }
      return ctx.changes;

    default:
      // For other property updates or unknown types, just return the changes
      return ctx.changes;
  }
};
