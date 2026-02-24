import { PdfCircleAnnoObject } from '@embedpdf/models';

import { PatchFunction } from '../patch-registry';
import {
  baseRotateChanges,
  baseMoveChanges,
  baseResizeScaling,
  basePropertyRotationChanges,
} from '../base-patch';

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

    case 'property-update':
      if (ctx.changes.rotation !== undefined) {
        return { ...ctx.changes, ...basePropertyRotationChanges(orig, ctx.changes.rotation) };
      }
      return ctx.changes;

    default:
      return ctx.changes;
  }
};
