import { PdfLineAnnoObject } from '@embedpdf/models';

import { PatchFunction } from '../patch-registry';
import { lineRectWithEndings } from '../patch-utils';

export const patchLine: PatchFunction<PdfLineAnnoObject> = (orig, ctx) => {
  // Handle different transformation types
  switch (ctx.type) {
    case 'vertex-edit':
      // Line vertex editing: update line points and recalculate rect
      if (ctx.changes.linePoints) {
        const { start, end } = ctx.changes.linePoints;
        const rect = lineRectWithEndings([start, end], orig.strokeWidth, orig.lineEndings);
        return {
          rect,
          linePoints: { start, end },
        };
      }
      return ctx.changes;

    case 'move':
      // Simple move: translate line points
      if (ctx.changes.rect) {
        const dx = ctx.changes.rect.origin.x - orig.rect.origin.x;
        const dy = ctx.changes.rect.origin.y - orig.rect.origin.y;

        return {
          rect: ctx.changes.rect,
          linePoints: {
            start: { x: orig.linePoints.start.x + dx, y: orig.linePoints.start.y + dy },
            end: { x: orig.linePoints.end.x + dx, y: orig.linePoints.end.y + dy },
          },
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

        // Scale line points relative to old rect and apply to new rect
        const newLinePoints = {
          start: {
            x: ctx.changes.rect!.origin.x + (orig.linePoints.start.x - oldRect.origin.x) * scaleX,
            y: ctx.changes.rect!.origin.y + (orig.linePoints.start.y - oldRect.origin.y) * scaleY,
          },
          end: {
            x: ctx.changes.rect!.origin.x + (orig.linePoints.end.x - oldRect.origin.x) * scaleX,
            y: ctx.changes.rect!.origin.y + (orig.linePoints.end.y - oldRect.origin.y) * scaleY,
          },
        };

        return {
          rect: ctx.changes.rect,
          linePoints: newLinePoints,
        };
      }
      return ctx.changes;

    case 'property-update':
      // For property updates that might affect the rect
      if (ctx.changes.strokeWidth || ctx.changes.lineEndings) {
        const merged = { ...orig, ...ctx.changes };
        const rect = lineRectWithEndings(
          [merged.linePoints.start, merged.linePoints.end],
          merged.strokeWidth,
          merged.lineEndings,
        );
        return { ...ctx.changes, rect };
      }
      return ctx.changes;
    default:
      // For property updates or unknown types, just return the changes
      return ctx.changes;
  }
};
