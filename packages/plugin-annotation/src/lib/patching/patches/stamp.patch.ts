import { PdfStampAnnoObject } from '@embedpdf/models';

import { PatchFunction } from '../patch-registry';
import { baseRotateChanges, baseMoveChanges, baseResizeScaling } from '../base-patch';

export const patchStamp: PatchFunction<PdfStampAnnoObject> = (orig, ctx) => {
  switch (ctx.type) {
    case 'move':
      if (!ctx.changes.rect) return ctx.changes;
      return baseMoveChanges(orig, ctx.changes.rect).rects;

    case 'resize':
      if (!ctx.changes.rect) return ctx.changes;
      return baseResizeScaling(orig, ctx.changes.rect, ctx.metadata).rects;

    case 'rotate':
      return baseRotateChanges(orig, ctx) ?? ctx.changes;

    default:
      return ctx.changes;
  }
};
