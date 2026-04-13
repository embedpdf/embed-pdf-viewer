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
import { getCloudyBorderExtent } from '../../geometry';

function getPolygonPad(intensity: number | undefined, strokeWidth: number): number {
  if ((intensity ?? 0) > 0) {
    return getCloudyBorderExtent(intensity!, strokeWidth, false);
  }
  return strokeWidth / 2;
}

export const patchPolygon: PatchFunction<PdfPolygonAnnoObject> = (orig, ctx) => {
  switch (ctx.type) {
    case 'vertex-edit':
      if (ctx.changes.vertices && ctx.changes.vertices.length) {
        const pad = getPolygonPad(orig.cloudyBorderIntensity, orig.strokeWidth);
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

    case 'property-update': {
      const cloudyChanged = ctx.changes.cloudyBorderIntensity !== undefined;
      const needsRectUpdate =
        ctx.changes.strokeWidth !== undefined ||
        ctx.changes.rotation !== undefined ||
        cloudyChanged;
      if (!needsRectUpdate) return ctx.changes;

      const merged = { ...orig, ...ctx.changes };
      const pad = getPolygonPad(merged.cloudyBorderIntensity, merged.strokeWidth);
      const tightRect = expandRect(rectFromPoints(merged.vertices), pad);

      let patch: Partial<PdfPolygonAnnoObject> = ctx.changes;

      const hasCloudy = (orig.cloudyBorderIntensity ?? 0) > 0;
      if (cloudyChanged || (ctx.changes.strokeWidth !== undefined && hasCloudy)) {
        const intensity = merged.cloudyBorderIntensity ?? 0;
        if (intensity > 0) {
          const extent = getCloudyBorderExtent(intensity, merged.strokeWidth, false);
          patch = {
            ...patch,
            rectangleDifferences: { left: extent, top: extent, right: extent, bottom: extent },
          };
        } else {
          patch = { ...patch, rectangleDifferences: undefined };
        }
      }

      const effectiveRotation = ctx.changes.rotation ?? orig.rotation ?? 0;
      if (orig.unrotatedRect || ctx.changes.rotation !== undefined) {
        return {
          ...patch,
          unrotatedRect: tightRect,
          rect: calculateRotatedRectAABBAroundPoint(
            tightRect,
            effectiveRotation,
            resolveAnnotationRotationCenter(orig),
          ),
        };
      }
      return { ...patch, rect: tightRect };
    }

    default:
      return ctx.changes;
  }
};
