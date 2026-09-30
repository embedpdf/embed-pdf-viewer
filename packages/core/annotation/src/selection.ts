/** The complete annotation frame shared by selection and transform gestures. */
import { anchoredGeom, anchoredStrokeWidth, anchorModeOf } from './anchor';
import { geomRotation, isRotatableGeom, selectionQuad, turnPivotOf } from './geometry';
import { measurementOf, type MeasurementAppearance } from './measurement';
import { measurementSelectionQuad } from './measurement-shape';
import { rotatePoint } from './rect';
import { shapeOf, styleOf } from './record';
import type { ModelAnnotation, Shape, QuadRing, Point, Style, ViewEnv } from './types';

export interface SelectionFrame {
  corners: QuadRing;
  center: Point;
  angle: number;
}

/**
 * The frame of `record` as it is drawn, or with `live` fields laid over its
 * own (a gesture's geometry, a screen-anchored stroke).
 */
export function annotationSelectionFrame(
  record: ModelAnnotation,
  view?: ViewEnv,
  live?: { geometry?: Shape; style?: Style; measure?: MeasurementAppearance },
): SelectionFrame {
  const style = live?.style ?? styleOf(record.annotation);
  const measure = live?.measure ?? measurementOf(record.annotation);
  const mode = anchorModeOf(record);
  const geometry = anchoredGeom(live?.geometry ?? shapeOf(record.annotation), mode, view);
  const strokeWidth = anchoredStrokeWidth(style.strokeWidth, mode, view);
  const corners = measure
    ? measurementSelectionQuad(geometry, measure, { ...style, strokeWidth })
    : selectionQuad(geometry, { ...style, strokeWidth: strokeWidth });

  // PDF /Rect is a page-aligned rendering envelope. Its conservative padding
  // must not change the editor's frame or rotation center after an engine echo.
  return {
    corners,
    center: {
      x: (corners[0].x + corners[1].x + corners[2].x + corners[3].x) / 4,
      y: (corners[0].y + corners[1].y + corners[2].y + corners[3].y) / 4,
    },
    angle: isRotatableGeom(geometry) ? geomRotation(geometry) : 0,
  };
}

/** Where a turn of `record` pivots (`turnPivotOf`), in its frame's space. */
export function annotationTurnPivot(record: ModelAnnotation, view?: ViewEnv): Point {
  return turnPivotOf(anchoredGeom(shapeOf(record.annotation), anchorModeOf(record), view));
}

/**
 * The frame grown about its middle to at least `size` on each of its own
 * sides: where a small annotation's rotate knob and grab area sit, so each
 * can be reached apart from its handles. A frame that big already is unchanged.
 */
export function frameAtLeast(frame: SelectionFrame, size: number): SelectionFrame {
  const along = rotatePoint({ x: 1, y: 0 }, ORIGIN, frame.angle);
  const across = rotatePoint({ x: 0, y: 1 }, ORIGIN, frame.angle);
  const [nw, ne, se, sw] = frame.corners;
  const width = Math.abs((ne.x - nw.x) * along.x + (ne.y - nw.y) * along.y);
  const height = Math.abs((sw.x - nw.x) * across.x + (sw.y - nw.y) * across.y);
  const grow = { x: Math.max(0, (size - width) / 2), y: Math.max(0, (size - height) / 2) };
  if (!grow.x && !grow.y) return frame;
  const out = (corner: Point, sideX: number, sideY: number): Point => ({
    x: corner.x + sideX * grow.x * along.x + sideY * grow.y * across.x,
    y: corner.y + sideX * grow.x * along.y + sideY * grow.y * across.y,
  });
  return {
    ...frame,
    corners: [out(nw, -1, -1), out(ne, 1, -1), out(se, 1, 1), out(sw, -1, 1)],
  };
}

const ORIGIN: Point = { x: 0, y: 0 };
