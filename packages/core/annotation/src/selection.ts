/** The complete annotation frame shared by selection and transform gestures. */
import { anchoredGeom, anchoredStrokeWidth, anchorModeOf } from './anchor';
import { geomRotation, isRotatableGeom, selectionQuad } from './geometry';
import { measurementSelectionQuad } from './measurement-shape';
import type { Annot, Quad, Vec, ViewEnv } from './types';

export interface SelectionFrame {
  corners: Quad;
  center: Vec;
  angle: number;
}

export function annotationSelectionFrame(annotation: Annot, view?: ViewEnv): SelectionFrame {
  const mode = anchorModeOf(annotation);
  const geometry = anchoredGeom(annotation.geom, mode, view);
  const strokeWidth = anchoredStrokeWidth(annotation.style.strokeWidth, mode, view);
  const corners = annotation.measure
    ? measurementSelectionQuad(geometry, annotation.measure, { ...annotation.style, strokeWidth })
    : selectionQuad(geometry, strokeWidth, annotation.style.border);

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
