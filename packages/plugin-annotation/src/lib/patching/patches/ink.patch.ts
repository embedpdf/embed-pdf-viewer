import { expandRect, PdfInkAnnoObject, Rect, rectFromPoints } from '@embedpdf/models';

import { PatchFunction } from '../patch-registry';

export const patchInk: PatchFunction<PdfInkAnnoObject> = (original, ctx) => {
  // Handle different transformation types
  switch (ctx.type) {
    case 'vertex-edit':
      // For ink annotations, vertex editing doesn't make much sense
      // Just return the changes as-is
      return ctx.changes;

    case 'move':
      // Simple move: just update rect and adjust ink points accordingly
      if (ctx.changes.rect) {
        const dx = ctx.changes.rect.origin.x - original.rect.origin.x;
        const dy = ctx.changes.rect.origin.y - original.rect.origin.y;

        const movedInkList = original.inkList.map((stroke) => ({
          points: stroke.points.map((p) => ({
            x: p.x + dx,
            y: p.y + dy,
          })),
        }));

        return {
          rect: ctx.changes.rect,
          inkList: movedInkList,
        };
      }
      return ctx.changes;

    case 'resize':
      // Complex resize with scaling
      if (ctx.changes.rect) {
        const oldRect = original.rect;
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

        // Keep stroke inside rect: map inner-old -> inner-new
        const inset = (r: Rect, pad: number): Rect => ({
          origin: { x: r.origin.x + pad, y: r.origin.y + pad },
          size: {
            width: Math.max(1, r.size.width - pad * 2),
            height: Math.max(1, r.size.height - pad * 2),
          },
        });

        // Scale stroke by the limiting axis to avoid overflow
        const strokeScale = Math.min(
          ctx.changes.rect!.size.width / oldRect.size.width,
          ctx.changes.rect!.size.height / oldRect.size.height,
        );
        const newStrokeWidth = Math.max(1, Math.round(original.strokeWidth * strokeScale));

        const innerOld = inset(oldRect, original.strokeWidth / 2);
        const innerNew = inset(ctx.changes.rect!, newStrokeWidth / 2);

        const sx = innerNew.size.width / Math.max(innerOld.size.width, 1e-6);
        const sy = innerNew.size.height / Math.max(innerOld.size.height, 1e-6);

        const newInkList = original.inkList.map((stroke) => ({
          points: stroke.points.map((p) => ({
            x: innerNew.origin.x + (p.x - innerOld.origin.x) * sx,
            y: innerNew.origin.y + (p.y - innerOld.origin.y) * sy,
          })),
        }));

        return {
          rect: ctx.changes.rect,
          inkList: newInkList,
          strokeWidth: newStrokeWidth,
        };
      }
      return ctx.changes;
    case 'property-update':
      // For property updates that might affect the rect (strokeWidth changes)
      if (ctx.changes.strokeWidth !== undefined) {
        const merged = { ...original, ...ctx.changes };
        // Recalculate rect using the same logic as deriveRect
        const pts = merged.inkList.flatMap((s) => s.points);
        const rect = expandRect(rectFromPoints(pts), merged.strokeWidth / 2);
        return { ...ctx.changes, rect };
      }
      return ctx.changes;
    default:
      // For other property updates or unknown types, just return the changes
      return ctx.changes;
  }
};
