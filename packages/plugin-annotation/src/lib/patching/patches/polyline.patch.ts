import { PdfPolylineAnnoObject } from '@embedpdf/models';

import { PatchFunction } from '../patch-registry';
import {
  compensateRotatedVertexEdit,
  calculateRotatedRectAABBAroundPoint,
  lineRectWithEndings,
  resolveAnnotationRotationCenter,
  resolveVertexEditRects,
} from '../patch-utils';
import { baseRotateChanges, baseMoveChanges, baseResizeScaling } from '../base-patch';

export const patchPolyline: PatchFunction<PdfPolylineAnnoObject> = (orig, ctx) => {
  switch (ctx.type) {
    case 'vertex-edit':
      if (ctx.changes.vertices && ctx.changes.vertices.length) {
        const rawVertices = ctx.changes.vertices;
        const rawRect = lineRectWithEndings(rawVertices, orig.strokeWidth, orig.lineEndings);
        const compensated = compensateRotatedVertexEdit(orig, rawVertices, rawRect);
        const rect = lineRectWithEndings(compensated, orig.strokeWidth, orig.lineEndings);
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

    case 'rotate':
      return baseRotateChanges(orig, ctx) ?? ctx.changes;

    case 'property-update':
      if (ctx.changes.strokeWidth !== undefined || ctx.changes.lineEndings !== undefined) {
        const merged = { ...orig, ...ctx.changes };
        const tightRect = lineRectWithEndings(
          merged.vertices,
          merged.strokeWidth,
          merged.lineEndings,
        );

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
