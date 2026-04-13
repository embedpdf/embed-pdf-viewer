import { PdfFreeTextAnnoObject, Position } from '@embedpdf/models';

import { PatchFunction } from '../patch-registry';
import {
  computeTextBoxFromRD,
  computeRDFromTextBox,
  computeCalloutConnectionPoint,
  computeCalloutOverallRect,
} from '../patch-utils';
import { baseMoveChanges, baseRotateChanges, rotateOrbitDelta } from '../base-patch';

function rebuildFromVertices(
  orig: PdfFreeTextAnnoObject,
  arrowTip: Position,
  knee: Position,
  tbTL: Position,
  tbBR: Position,
): Partial<PdfFreeTextAnnoObject> {
  const textBox = {
    origin: { x: Math.min(tbTL.x, tbBR.x), y: Math.min(tbTL.y, tbBR.y) },
    size: {
      width: Math.abs(tbBR.x - tbTL.x),
      height: Math.abs(tbBR.y - tbTL.y),
    },
  };
  const connectionPoint = computeCalloutConnectionPoint(knee, textBox);
  const calloutLine = [arrowTip, knee, connectionPoint];
  const overallRect = computeCalloutOverallRect(
    textBox,
    calloutLine,
    orig.lineEnding,
    orig.strokeWidth ?? 1,
  );
  return {
    calloutLine,
    rect: overallRect,
    rectangleDifferences: computeRDFromTextBox(overallRect, textBox),
  };
}

export const patchCalloutFreeText: PatchFunction<PdfFreeTextAnnoObject> = (orig, ctx) => {
  switch (ctx.type) {
    case 'vertex-edit': {
      if (!ctx.changes.calloutLine) return ctx.changes;
      const verts = ctx.changes.calloutLine as Position[];
      if (verts.length < 4) return ctx.changes;
      return rebuildFromVertices(orig, verts[0], verts[1], verts[2], verts[3]);
    }

    case 'move': {
      if (!ctx.changes.rect) return ctx.changes;
      const { dx, dy, rects } = baseMoveChanges(orig, ctx.changes.rect);
      const movedLine = orig.calloutLine?.map((p) => ({ x: p.x + dx, y: p.y + dy }));
      return {
        ...rects,
        ...(movedLine && { calloutLine: movedLine }),
      };
    }

    case 'rotate': {
      const result = baseRotateChanges(orig, ctx);
      if (!result) return ctx.changes;
      const { dx, dy } = rotateOrbitDelta(orig, result);
      const movedLine = orig.calloutLine?.map((p) => ({ x: p.x + dx, y: p.y + dy }));
      return {
        ...result,
        ...(movedLine && { calloutLine: movedLine }),
      };
    }

    case 'property-update': {
      if (ctx.changes.lineEnding !== undefined || ctx.changes.strokeWidth !== undefined) {
        const merged = { ...orig, ...ctx.changes };
        if (merged.calloutLine && merged.calloutLine.length >= 3) {
          const textBox = computeTextBoxFromRD(orig.rect, orig.rectangleDifferences);
          const overallRect = computeCalloutOverallRect(
            textBox,
            merged.calloutLine,
            merged.lineEnding,
            merged.strokeWidth ?? 1,
          );
          return {
            ...ctx.changes,
            rect: overallRect,
            rectangleDifferences: computeRDFromTextBox(overallRect, textBox),
          };
        }
      }
      return ctx.changes;
    }

    default:
      return ctx.changes;
  }
};
