import { PdfLineAnnoObject } from '@embedpdf/models';

import { PatchFunction } from '../patch-registry';
import {
  compensateRotatedVertexEdit,
  lineRectWithEndings,
  resolveVertexEditRects,
  calculateRotatedRectAABBAroundPoint,
  resolveAnnotationRotationCenter,
} from '../patch-utils';
import {
  baseRotateChanges,
  baseMoveChanges,
  baseResizeScaling,
  rotateOrbitDelta,
} from '../base-patch';

export const patchLine: PatchFunction<PdfLineAnnoObject> = (orig, ctx) => {
  switch (ctx.type) {
    case 'vertex-edit':
      if (ctx.changes.linePoints) {
        const { start, end } = ctx.changes.linePoints;
        const rawPoints = [start, end];
        const rawRect = lineRectWithEndings(rawPoints, orig.strokeWidth, orig.lineEndings);
        const compensated = compensateRotatedVertexEdit(orig, rawPoints, rawRect);
        const rect = lineRectWithEndings(compensated, orig.strokeWidth, orig.lineEndings);
        return {
          ...resolveVertexEditRects(orig, rect),
          linePoints: { start: compensated[0], end: compensated[1] },
        };
      }
      return ctx.changes;

    case 'move': {
      if (!ctx.changes.rect) return ctx.changes;
      const { dx, dy, rects } = baseMoveChanges(orig, ctx.changes.rect);
      return {
        ...rects,
        linePoints: {
          start: { x: orig.linePoints.start.x + dx, y: orig.linePoints.start.y + dy },
          end: { x: orig.linePoints.end.x + dx, y: orig.linePoints.end.y + dy },
        },
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
        linePoints: {
          start: {
            x: resolvedRect.origin.x + (orig.linePoints.start.x - oldRect.origin.x) * scaleX,
            y: resolvedRect.origin.y + (orig.linePoints.start.y - oldRect.origin.y) * scaleY,
          },
          end: {
            x: resolvedRect.origin.x + (orig.linePoints.end.x - oldRect.origin.x) * scaleX,
            y: resolvedRect.origin.y + (orig.linePoints.end.y - oldRect.origin.y) * scaleY,
          },
        },
      };
    }

    case 'rotate': {
      const result = baseRotateChanges(orig, ctx);
      if (!result) return ctx.changes;
      const { dx, dy } = rotateOrbitDelta(orig, result);
      return {
        ...result,
        linePoints: {
          start: { x: orig.linePoints.start.x + dx, y: orig.linePoints.start.y + dy },
          end: { x: orig.linePoints.end.x + dx, y: orig.linePoints.end.y + dy },
        },
      };
    }

    case 'property-update':
      if (ctx.changes.strokeWidth || ctx.changes.lineEndings) {
        const merged = { ...orig, ...ctx.changes };
        const tightRect = lineRectWithEndings(
          [merged.linePoints.start, merged.linePoints.end],
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
