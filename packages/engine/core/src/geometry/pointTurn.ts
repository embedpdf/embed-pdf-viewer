/**
 * Turning points about a middle, in PDF user space (y up). A line's,
 * polyline's, polygon's or ink's points turn about the middle of the box
 * around them before the turn, as a square turns about its box.
 */

import type { PdfPoint, PdfRect } from './primitives';

/** A turn: degrees clockwise, as the page shows it, about `center`. */
export interface PdfPointTurn {
  degrees: number;
  center: PdfPoint;
}

/** The box around `points`; a zero box at the origin when there are none. */
export function pdfPointsBounds(points: readonly PdfPoint[]): PdfRect {
  if (points.length === 0) return { left: 0, bottom: 0, right: 0, top: 0 };
  let left = Infinity;
  let bottom = Infinity;
  let right = -Infinity;
  let top = -Infinity;
  for (const { x, y } of points) {
    left = Math.min(left, x);
    bottom = Math.min(bottom, y);
    right = Math.max(right, x);
    top = Math.max(top, y);
  }
  return { left, bottom, right, top };
}

/** `point` turned by `turn`; a negative angle turns it back. */
export function pdfPointTurned(point: PdfPoint, turn: PdfPointTurn): PdfPoint {
  const radians = (turn.degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point.x - turn.center.x;
  const dy = point.y - turn.center.y;
  // Clockwise on the page is negative in y-up space.
  return {
    x: turn.center.x + dx * cos + dy * sin,
    y: turn.center.y - dx * sin + dy * cos,
  };
}

/** `point` turned back by `turn`. */
export function pdfPointUnturned(point: PdfPoint, turn: PdfPointTurn): PdfPoint {
  return pdfPointTurned(point, { degrees: -turn.degrees, center: turn.center });
}

const middleOf = (rect: PdfRect): PdfPoint => ({
  x: (rect.left + rect.right) / 2,
  y: (rect.bottom + rect.top) / 2,
});

/** The turn that draws upright `points`: `degrees` about the middle of their box. */
export function pdfTurnOfUpright(points: readonly PdfPoint[], degrees: number): PdfPointTurn {
  return { degrees, center: middleOf(pdfPointsBounds(points)) };
}

/**
 * The turn drawn `points` were made with: `degrees` about the middle of the
 * box around the upright points they came from. That middle is where the turn
 * leaves it, so it follows from the drawing: turned back about the origin, the
 * points are the upright ones moved, and turning their middle forward again
 * about the origin gives it.
 */
export function pdfTurnOfDrawn(points: readonly PdfPoint[], degrees: number): PdfPointTurn {
  const origin = { x: 0, y: 0 };
  const back = points.map((point) => pdfPointTurned(point, { degrees: -degrees, center: origin }));
  const middle = middleOf(pdfPointsBounds(back));
  return { degrees, center: pdfPointTurned(middle, { degrees, center: origin }) };
}
