/** The complete annotation frame shared by selection and transform gestures. */
import { anchoredGeom, anchoredStrokeWidth, anchorModeOf } from './anchor';
import { geomRotation, isRotatableGeom, selectionQuad, turnPivotOf } from './geometry';
import { measurementSelectionQuad } from './measurement-shape';
import { fieldsOf } from './record';
import type { ModelAnnotation, QuadRing, Point, RecordFields, ViewEnv } from './types';

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
  live?: Partial<Pick<RecordFields, 'geometry' | 'style' | 'measure'>>,
): SelectionFrame {
  const fields = live ? { ...fieldsOf(annotation), ...live } : fieldsOf(annotation);
  const mode = anchorModeOf(annotation);
  const geometry = anchoredGeom(fields.geometry, mode, view);
  const strokeWidth = anchoredStrokeWidth(fields.style.strokeWidth, mode, view);
  const corners = fields.measure
    ? measurementSelectionQuad(geometry, fields.measure, { ...fields.style, strokeWidth })
    : selectionQuad(geometry, strokeWidth, fields.style.border);

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
  return turnPivotOf(anchoredGeom(fieldsOf(annotation).geometry, anchorModeOf(annotation), view));
}
