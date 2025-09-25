import { PdfPolylineAnnoObject } from '@embedpdf/models';

import { PatchFunction } from '../patch-registry';
import { lineRectWithEndings } from '../patch-utils';

export const patchPolyline: PatchFunction<PdfPolylineAnnoObject> = (orig, ctx) => {
  // Handle different transformation types
  switch (ctx.type) {
    case 'vertex-edit':
      // Polyline vertex editing: update vertices and recalculate rect
      if (ctx.changes.vertices && ctx.changes.vertices.length) {
        return {
          rect: lineRectWithEndings(ctx.changes.vertices, orig.strokeWidth, orig.lineEndings),
          vertices: ctx.changes.vertices,
        };
      }
      return ctx.changes;

    case 'move':
      // Simple move: translate all vertices
      if (ctx.changes.rect) {
        const dx = ctx.changes.rect.origin.x - orig.rect.origin.x;
        const dy = ctx.changes.rect.origin.y - orig.rect.origin.y;
        const moved = orig.vertices.map((p) => ({ x: p.x + dx, y: p.y + dy }));

        return {
          rect: ctx.changes.rect,
          vertices: moved,
        };
      }
      return ctx.changes;

    case 'resize':
      // Complex resize with scaling
      if (ctx.changes.rect) {
        const oldRect = orig.rect;
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

        return {
          rect: ctx.changes.rect,
          vertices: scaledVertices,
        };
      }
      return ctx.changes;
    case 'property-update':
      // For property updates that might affect the rect (strokeWidth or lineEndings changes)
      if (ctx.changes.strokeWidth !== undefined || ctx.changes.lineEndings !== undefined) {
        const merged = { ...orig, ...ctx.changes };
        // Recalculate rect using the same logic as deriveRect
        const rect = lineRectWithEndings(merged.vertices, merged.strokeWidth, merged.lineEndings);
        return { ...ctx.changes, rect };
      }
      return ctx.changes;
    default:
      // For other property updates or unknown types, just return the changes
      return ctx.changes;
  }
};
