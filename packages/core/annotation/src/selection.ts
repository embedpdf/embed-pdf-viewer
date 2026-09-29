/** The complete annotation frame shared by selection and transform gestures. */
import { anchoredGeom, anchoredStrokeWidth, anchorModeOf } from './anchor';
import { geomRotation, isRotatableGeom, selectionQuad, turnPivotOf } from './geometry';
import { measurementOf, type MeasurementAppearance } from './measurement';
import { measurementSelectionQuad } from './measurement-shape';
import { fieldsOf, shapeOf } from './record';
import type { ModelAnnotation, ModelGeometry, QuadRing, Point, Style, ViewEnv } from './types';

export interface SelectionFrame {
  corners: QuadRing;
  center: Point;
  angle: number;
}

/**
 * The frame of `annotation` as it is drawn, or with `live` fields laid over its
 * own (a gesture's geometry, a screen-anchored stroke).
 */
export function annotationSelectionFrame(
  annotation: ModelAnnotation,
  view?: ViewEnv,
  live?: { geometry?: ModelGeometry; style?: Style; measure?: MeasurementAppearance },
): SelectionFrame {
  const style = live?.style ?? fieldsOf(annotation).style;
  const measure = live?.measure ?? measurementOf(annotation.annotation);
  const mode = anchorModeOf(annotation);
  const geometry = anchoredGeom(live?.geometry ?? shapeOf(annotation.annotation), mode, view);
  const strokeWidth = anchoredStrokeWidth(style.strokeWidth, mode, view);
  const corners = measure
    ? measurementSelectionQuad(geometry, measure, { ...style, strokeWidth })
    : selectionQuad(geometry, strokeWidth, style.border);

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

/** Where a turn of `annotation` pivots (`turnPivotOf`), in its frame's space. */
export function annotationTurnPivot(annotation: ModelAnnotation, view?: ViewEnv): Point {
  return turnPivotOf(anchoredGeom(shapeOf(annotation.annotation), anchorModeOf(annotation), view));
}
