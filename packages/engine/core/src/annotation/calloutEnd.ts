import { pdfPointTurned, pdfPointUnturned } from '../geometry/pointTurn';
import type { PdfPoint, PdfRect } from '../geometry/primitives';

/**
 * Where a callout's line meets its text box: the middle of the side `toward`
 * (the knee, else the tip) lies beyond, chosen by which way it is farther
 * from the box's middle, across or up and down. A turned box decides in its
 * own frame, and the point lands on the turned side, the one the page shows.
 * In the file's coordinates.
 */
export function pdfCalloutEnd(box: PdfRect, toward: PdfPoint, rotation: number): PdfPoint {
  const center = { x: (box.left + box.right) / 2, y: (box.bottom + box.top) / 2 };
  const turn = { degrees: rotation, center };
  const local = rotation ? pdfPointUnturned(toward, turn) : toward;
  const dx = local.x - center.x;
  const dy = local.y - center.y;
  const end =
    Math.abs(dx) >= Math.abs(dy)
      ? { x: dx >= 0 ? box.right : box.left, y: center.y }
      : { x: center.x, y: dy > 0 ? box.top : box.bottom };
  return rotation ? pdfPointTurned(end, turn) : end;
}
