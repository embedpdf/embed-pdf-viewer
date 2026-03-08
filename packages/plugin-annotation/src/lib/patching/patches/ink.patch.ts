import { expandRect, PdfInkAnnoObject, Rect, rectFromPoints } from '@embedpdf/models';

import { PatchFunction } from '../patch-registry';
import {
  calculateRotatedRectAABBAroundPoint,
  resolveAnnotationRotationCenter,
} from '../patch-utils';
import {
  baseRotateChanges,
  baseMoveChanges,
  baseResizeScaling,
  rotateOrbitDelta,
} from '../base-patch';

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

      // Side handles should scale stroke width on that axis directly; corner
      // resize keeps previous min-axis behavior for non-uniform scaling.
      const resizeEpsilon = 1e-3;
      const widthChanged = Math.abs(scaleX - 1) > resizeEpsilon;
      const heightChanged = Math.abs(scaleY - 1) > resizeEpsilon;
      const strokeScale =
        widthChanged && !heightChanged
          ? scaleX
          : !widthChanged && heightChanged
            ? scaleY
            : Math.min(scaleX, scaleY);
      const rawStrokeWidth = Math.max(1, original.strokeWidth * strokeScale);
      const maxStrokeWidth = Math.max(
        1,
        Math.min(resolvedRect.size.width, resolvedRect.size.height),
      );
      const clampedStrokeWidth = Math.min(rawStrokeWidth, maxStrokeWidth);
      const newStrokeWidth = Number(clampedStrokeWidth.toFixed(1));

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

    case 'rotate': {
      const result = baseRotateChanges(original, ctx);
      if (!result) return ctx.changes;
      const { dx, dy } = rotateOrbitDelta(original, result);
      return {
        ...result,
        inkList: original.inkList.map((stroke) => ({
          points: stroke.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
        })),
      };
    }

    case 'property-update': {
      const needsRectUpdate =
        ctx.changes.strokeWidth !== undefined || ctx.changes.rotation !== undefined;
      if (!needsRectUpdate) return ctx.changes;

      const merged = { ...original, ...ctx.changes };
      const pts = merged.inkList.flatMap((s) => s.points);
      const tightRect = expandRect(rectFromPoints(pts), merged.strokeWidth / 2);

      const effectiveRotation = ctx.changes.rotation ?? original.rotation ?? 0;
      if (original.unrotatedRect || ctx.changes.rotation !== undefined) {
        return {
          ...ctx.changes,
          unrotatedRect: tightRect,
          rect: calculateRotatedRectAABBAroundPoint(
            tightRect,
            effectiveRotation,
            resolveAnnotationRotationCenter(original),
          ),
        };
      }
      return { ...ctx.changes, rect: tightRect };
    }

    default:
      return ctx.changes;
  }
};
