import { expandRect, PdfPolygonAnnoObject, rectFromPoints } from '@embedpdf/models';

import { PatchFunction } from '../patch-registry';
import {
  compensateRotatedVertexEdit,
  calculateRotatedRectAABBAroundPoint,
  resolveAnnotationRotationCenter,
  resolveVertexEditRects,
} from '../patch-utils';
import {
  baseRotateChanges,
  baseMoveChanges,
  baseResizeScaling,
  rotateOrbitDelta,
} from '../base-patch';

export const patchPolygon: PatchFunction<PdfPolygonAnnoObject> = (orig, ctx) => {
  switch (ctx.type) {
    case 'vertex-edit':
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

    case 'move': {
      if (!ctx.changes.rect) return ctx.changes;
      const { dx, dy, rects } = baseMoveChanges(orig, ctx.changes.rect);
      return {
        ...rects,
        vertices: orig.vertices.map((p) => ({ x: p.x + dx, y: p.y + dy })),
      };
    }

    case 'resize': {
      if (!ctx.changes.rect) return ctx.changes;
      const { scaleX, scaleY, oldRect, resolvedRect, rects } = baseResizeScaling(
        orig,
        ctx.changes.rect,
        ctx.metadata,
      );
      return {
        ...rects,
        vertices: orig.vertices.map((v) => ({
          x: resolvedRect.origin.x + (v.x - oldRect.origin.x) * scaleX,
          y: resolvedRect.origin.y + (v.y - oldRect.origin.y) * scaleY,
        })),
      };
    }

    case 'rotate': {
      const result = baseRotateChanges(orig, ctx);
      if (!result) return ctx.changes;
      const { dx, dy } = rotateOrbitDelta(orig, result);
      return {
        ...result,
        vertices: orig.vertices.map((v) => ({ x: v.x + dx, y: v.y + dy })),
      };
    }

    case 'property-update':
      if (ctx.changes.strokeWidth !== undefined) {
        const merged = { ...orig, ...ctx.changes };
        const pad = merged.strokeWidth / 2;
        const tightRect = expandRect(rectFromPoints(merged.vertices), pad);

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
      return ctx.changes;
  }
};
