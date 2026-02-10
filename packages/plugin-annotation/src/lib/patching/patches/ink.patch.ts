import { expandRect, PdfInkAnnoObject, Rect, rectFromPoints } from '@embedpdf/models';

import { PatchFunction } from '../patch-registry';
import {
  calculateRotatedRectAABB,
  calculateRotatedRectAABBAroundPoint,
  resolveAnnotationRotationCenter,
} from '../patch-utils';
import { baseRotateChanges, baseMoveChanges, baseResizeScaling } from '../base-patch';

export const patchInk: PatchFunction<PdfInkAnnoObject> = (original, ctx) => {
  switch (ctx.type) {
    case 'vertex-edit':
      return ctx.changes;

    case 'move': {
      if (!ctx.changes.rect) return ctx.changes;
      const { dx, dy, rects } = baseMoveChanges(original, ctx.changes.rect);
      return {
        ...rects,
        inkList: original.inkList.map((stroke) => ({
          points: stroke.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
        })),
      };
    }

    case 'resize': {
      if (!ctx.changes.rect) return ctx.changes;

      // Use base scaling for scale factors, min-size enforcement, and aspect ratio
      const { scaleX, scaleY, oldRect, resolvedRect, rects } = baseResizeScaling(
        original,
        ctx.changes.rect,
        ctx.metadata,
      );

      // Ink-specific: scale stroke width and use inset mapping to keep strokes inside rect
      const inset = (r: Rect, pad: number): Rect => ({
        origin: { x: r.origin.x + pad, y: r.origin.y + pad },
        size: {
          width: Math.max(1, r.size.width - pad * 2),
          height: Math.max(1, r.size.height - pad * 2),
        },
      });

      const strokeScale = Math.min(
        resolvedRect.size.width / oldRect.size.width,
        resolvedRect.size.height / oldRect.size.height,
      );
      const newStrokeWidth = Math.max(1, Math.round(original.strokeWidth * strokeScale));

      const innerOld = inset(oldRect, original.strokeWidth / 2);
      const innerNew = inset(resolvedRect, newStrokeWidth / 2);

      const sx = innerNew.size.width / Math.max(innerOld.size.width, 1e-6);
      const sy = innerNew.size.height / Math.max(innerOld.size.height, 1e-6);

      return {
        ...rects,
        inkList: original.inkList.map((stroke) => ({
          points: stroke.points.map((p) => ({
            x: innerNew.origin.x + (p.x - innerOld.origin.x) * sx,
            y: innerNew.origin.y + (p.y - innerOld.origin.y) * sy,
          })),
        })),
        strokeWidth: newStrokeWidth,
      };
    }

    case 'rotate':
      return baseRotateChanges(original, ctx) ?? ctx.changes;

    case 'property-update':
      if (ctx.changes.strokeWidth !== undefined) {
        const merged = { ...original, ...ctx.changes };
        const pts = merged.inkList.flatMap((s) => s.points);
        const tightRect = expandRect(rectFromPoints(pts), merged.strokeWidth / 2);

        if (original.unrotatedRect) {
          return {
            ...ctx.changes,
            unrotatedRect: tightRect,
            rect: calculateRotatedRectAABBAroundPoint(
              tightRect,
              original.rotation ?? 0,
              resolveAnnotationRotationCenter(original),
            ),
          };
        }
        return { ...ctx.changes, rect: tightRect };
      }
      return ctx.changes;

    default:
      return ctx.changes;
  }
};
