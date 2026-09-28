import {
  pdfPointsBounds,
  pdfPointTurned,
  pdfTurnOfUpright,
  semanticEqual,
  type PdfPoint,
  type PdfPointTurn,
} from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { setAnnotRect } from './annotationWritePrimitives';
import { shiftAnnotRect, shiftBetween } from './shiftAnnotRect';
import { writeRecordedTurn } from './writeAnnotationTransformMetadata';
import { readDrawnPointSets, readPointsTurn, uprightPoint } from '../read/readPointsTurn';

/**
 * A line's, polyline's, polygon's or ink's points, given upright, and their
 * turn. The file keeps them as drawn — turned about the middle of their box —
 * and our keys keep the turn and that box (`readPointsTurn`). `/Rect` is the
 * box around the drawn points until the appearance is drawn and measures what
 * it paints.
 */

/** Points placed on the page: as drawn, in the lists the kind keeps them in, and their turn. */
export interface PlacedPoints {
  drawn: PdfPoint[][];
  /** `null` upright. */
  turn: PdfPointTurn | null;
}

/** What the annotation has now: its points upright and as drawn, and the turn read. */
export interface CurrentPoints {
  upright: PdfPoint[][];
  drawn: PdfPoint[][];
  turn: PdfPointTurn | undefined;
}

/** The turn as the file keeps it: a turn of 0 is none. */
const turnOf = (rotation: number | null | undefined): number | null => rotation || null;

const normalizeDegrees = (degrees: number): number => ((degrees % 360) + 360) % 360;

/** Upright `points` turned by `rotation`, with our keys recording the turn. */
function placePoints(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  upright: readonly (readonly PdfPoint[])[],
  rotation: number | null,
): PlacedPoints {
  const all = upright.flat();
  const turn = rotation === null || all.length === 0 ? null : pdfTurnOfUpright(all, rotation);
  writeRecordedTurn(
    fn,
    mem,
    annotPtr,
    turn ? { rotation: turn.degrees, box: pdfPointsBounds(all) } : null,
  );
  return {
    drawn: upright.map((set) => set.map((point) => (turn ? pdfPointTurned(point, turn) : point))),
    turn,
  };
}

/** A create's points, placed, with `/Rect` around them until the appearance measures itself. */
export function writeNewPoints(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  upright: readonly (readonly PdfPoint[])[],
  rotation: number | null | undefined,
): PlacedPoints {
  const placed = placePoints(fn, mem, annotPtr, upright, turnOf(rotation));
  setAnnotRect(fn, mem, annotPtr, pdfPointsBounds(placed.drawn.flat()));
  return placed;
}

export function readCurrentPoints(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
): CurrentPoints {
  const drawn = readDrawnPointSets(fn, mem, annotPtr);
  const turn = readPointsTurn(fn, mem, annotPtr, drawn);
  return {
    drawn,
    turn,
    upright: drawn.map((set) => set.map((point) => uprightPoint(point, turn))),
  };
}

/**
 * An update's points and turn, each kept when left out (`rotation: null`
 * straightens the points where they are); `undefined` when neither changes.
 * When the drawn points only shift, `/Rect` shifts with them: an appearance
 * that isn't drawn again moves with it.
 */
export function updatePoints(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  current: CurrentPoints,
  upright: readonly (readonly PdfPoint[])[] | undefined,
  rotation: number | null | undefined,
): PlacedPoints | undefined {
  if (upright === undefined && rotation === undefined) return undefined;
  const currentRotation = current.turn?.degrees ?? null;
  const nextRotation = rotation === undefined ? currentRotation : turnOf(rotation);
  const sameTurn = semanticEqual(
    normalizeDegrees(nextRotation ?? 0),
    normalizeDegrees(currentRotation ?? 0),
  );
  if (upright === undefined && sameTurn) return undefined;
  const placed = placePoints(fn, mem, annotPtr, upright ?? current.upright, nextRotation);
  const shift = shiftBetween(current.drawn.flat(), placed.drawn.flat());
  if (shift) shiftAnnotRect(fn, mem, annotPtr, shift);
  return placed;
}
