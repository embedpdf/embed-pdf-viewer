import type { Annotation } from './kinds';
import type { PdfCoordinates } from '../pageSpace/coordinates';
import { pdfPointTurned, pdfTurnOfUpright } from '../geometry/pointTurn';
import type { PdfPoint } from '../geometry/primitives';

/**
 * The points of a line, polyline, polygon or ink as the page shows them: the
 * upright points a read gives, turned by `rotation` about the middle of their
 * box. One list for a line (its two ends) or a polygon, one per ink stroke;
 * `null` for any other kind.
 */
export function pdfDrawnPointsOf(annotation: Annotation<PdfCoordinates>): PdfPoint[][] | null {
  let sets: PdfPoint[][];
  switch (annotation.subtype) {
    case 'line':
      sets = [[annotation.linePoints.start, annotation.linePoints.end]];
      break;
    case 'polyline':
    case 'polygon':
      sets = [annotation.vertices];
      break;
    case 'ink':
      sets = annotation.inkList.map((stroke) => [...stroke]);
      break;
    default:
      return null;
  }
  if (!annotation.rotation) return sets.map((set) => set.map((point) => ({ ...point })));
  const turn = pdfTurnOfUpright(sets.flat(), annotation.rotation);
  return sets.map((set) => set.map((point) => pdfPointTurned(point, turn)));
}
