import { PdfCircleAnnoObject } from '@embedpdf/models';

import { PatchFunction } from '../patch-registry';
import {
  baseRotateChanges,
  baseMoveChanges,
  baseResizeScaling,
  basePropertyRotationChanges,
} from '../base-patch';
import { getCloudyBorderExtent } from '../../geometry';

export const patchCircle: PatchFunction<PdfCircleAnnoObject> = (orig, ctx) => {
  switch (ctx.type) {
    case 'move':
      if (!ctx.changes.rect) return ctx.changes;
      return baseMoveChanges(orig, ctx.changes.rect).rects;

    case 'resize':
      if (!ctx.changes.rect) return ctx.changes;
      return baseResizeScaling(orig, ctx.changes.rect, ctx.metadata).rects;

    case 'rotate':
      return baseRotateChanges(orig, ctx) ?? ctx.changes;

    case 'property-update': {
      let patch: Partial<PdfCircleAnnoObject> = ctx.changes;

      const cloudyChanged = ctx.changes.cloudyBorderIntensity !== undefined;
      const strokeChanged = ctx.changes.strokeWidth !== undefined;
      const hasCloudy = (orig.cloudyBorderIntensity ?? 0) > 0;

      if (cloudyChanged || (strokeChanged && hasCloudy)) {
        const merged = { ...orig, ...ctx.changes };
        const intensity = merged.cloudyBorderIntensity ?? 0;
        if (intensity > 0) {
          const extent = getCloudyBorderExtent(intensity, merged.strokeWidth, true);
          patch = {
            ...patch,
            rectangleDifferences: { left: extent, top: extent, right: extent, bottom: extent },
          };
        } else {
          patch = { ...patch, rectangleDifferences: undefined };
        }
      }

      if (ctx.changes.rotation !== undefined) {
        patch = { ...patch, ...basePropertyRotationChanges(orig, ctx.changes.rotation) };
      }

      return patch;
    }

    default:
      return ctx.changes;
  }
};
