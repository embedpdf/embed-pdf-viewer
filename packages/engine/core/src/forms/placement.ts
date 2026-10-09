import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import { normalizePdfRect, pdfRectTurnedBounds } from '../geometry/convert';
import type { PdfRect } from '../geometry/primitives';
import type { PdfCoordinates } from '../pageSpace/coordinates';
import type { WidgetPlacement } from './draft';

/** A placement once resolved (`placedWidgetOf`): where the widget stands is stated. */
export type PlacedWidget = Omit<WidgetPlacement<PdfCoordinates>, 'rect' | 'box'> & {
  rect: PdfRect;
};

/**
 * A placement as the file holds it: `/Rect`, where the widget stands, and
 * its turn. A `box` given is turned into the rect it stands in, as a box
 * kind's create turns it; without one, `rect` is that place.
 *
 * Refused with `InvalidArg`: a placement with neither, and a turn that
 * isn't a quarter turn (a widget's contents turn only so, `/MK /R`).
 */
export function placedWidgetOf(placement: WidgetPlacement<PdfCoordinates>): PlacedWidget {
  const { box, rect, rotation, ...rest } = placement;
  if (rotation !== undefined && ![0, 90, 180, 270].includes(rotation)) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      `a widget turns by a quarter turn (0, 90, 180 or 270), not ${rotation}`,
      { details: { field: 'rotation' } },
    );
  }
  const place = box ? pdfRectTurnedBounds(normalizePdfRect(box), rotation ?? 0) : rect;
  if (!place) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      "a widget's placement needs its `rect` or its `box`",
      { details: { field: 'rect' } },
    );
  }
  return { ...rest, rect: place, ...(rotation !== undefined ? { rotation } : {}) };
}
