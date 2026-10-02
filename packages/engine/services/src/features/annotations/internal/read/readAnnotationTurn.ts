import {
  isSamePdfRect,
  normalizePdfRect,
  pdfRectTurnedBounds,
  PdfAnnotationSubtypeCode,
  type PdfRect,
} from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { readAnnotRect, readRectangleDifferences } from './annotationReadPrimitives';
import { clockwiseFromPdf } from './readAnnotationTransformMetadata';
import { withScratch } from '../../../../runtime/memory/scratch';
import {
  F32_BYTES,
  MATRIXF_BYTES,
  RECTF_BYTES,
  readF32,
  readMatrixF,
  readRectF,
  type MatrixF,
} from '../../../../runtime/memory/structs';

/**
 * The turn a box kind is drawn with. What's drawn decides: another app's turn
 * reads as ours does, and our keys count only while they still describe the
 * file. The first of these that holds:
 *
 *   1. Our `/EMBD_Metadata` keys (`Rotation`, `UnrotatedRect`), while the
 *      upright box around the box turned by the angle is `/Rect` less `/RD`
 *      and the angle is the one drawn. Another app that moves or redraws the
 *      annotation leaves them behind.
 *   2. The appearance: the form its drawing is in (the fork's
 *      `EPDFAnnot_GetAppearanceTransform`) is turned and stretched evenly onto
 *      `/Rect`, as a stamp Acrobat turned is. The angle is Acrobat's `/Rotate`
 *      when that's the same turn (a matrix holds it to a few decimals), else
 *      the matrix's to hundredths of a degree.
 *   3. A free text's quarter turn in `/Rotate`: Acrobat writes one for a text
 *      box added on a turned page and turns the text inside an upright frame,
 *      so the box is the frame with its sides swapped.
 *
 * Upright, the box is `/Rect` less `/RD`: `/Rect` also holds what the drawing
 * adds around the shape (a cloudy border's bumps, a callout's line).
 *
 * Angles here are the file's, counterclockwise; the read returns the API's.
 */

/** How a box kind is drawn turned: degrees clockwise about the middle of its own box. */
export interface AnnotationTurn {
  rotation: number;
  box: PdfRect;
}

/** A box kind's box, and its turn (degrees clockwise) or `null` upright. */
export interface AnnotationBox {
  box: PdfRect;
  rotation: number | null;
}

/** The kinds that turn as a box about its middle. */
const BOX_KINDS: ReadonlySet<number> = new Set([
  PdfAnnotationSubtypeCode.SQUARE,
  PdfAnnotationSubtypeCode.CIRCLE,
  PdfAnnotationSubtypeCode.FREETEXT,
  PdfAnnotationSubtypeCode.STAMP,
  PdfAnnotationSubtypeCode.CARET,
]);

/** Degrees: files write angles to a few decimals. */
const ANGLE_TOLERANCE = 0.05;
/** Relative to the scale: how far a matrix may be from a turn times an even scale. */
const SHAPE_TOLERANCE = 2e-3;
const QUARTER_TURNS = [90, 180, 270];
/** Degrees: a recorded turn smaller than this either way is none, as the generator reads it. */
const RECORDED_MIN = 0.01;

interface Turn {
  /** Counterclockwise, in [0, 360). */
  degrees: number;
  box: PdfRect;
}

const normalizeDegrees = (degrees: number): number => ((degrees % 360) + 360) % 360;

function angleBetween(degrees: number, other: number): number {
  const difference = Math.abs(normalizeDegrees(degrees) - normalizeDegrees(other));
  return Math.min(difference, 360 - difference);
}

const isSameTurn = (degrees: number, other: number): boolean =>
  angleBetween(degrees, other) <= ANGLE_TOLERANCE;

/** The turn of a matrix that is a turn times an even scale, counterclockwise; `undefined` for any other. */
function matrixTurn(m: MatrixF): number | undefined {
  const scale = Math.hypot(m.a, m.b);
  if (!(scale > 0)) return undefined;
  const tolerance = SHAPE_TOLERANCE * scale;
  if (Math.abs(m.a - m.d) > tolerance || Math.abs(m.b + m.c) > tolerance) return undefined;
  const degrees = normalizeDegrees((Math.atan2(m.b, m.a) * 180) / Math.PI);
  return angleBetween(degrees, 0) > ANGLE_TOLERANCE ? degrees : undefined;
}

/** `/Rotate` when the annotation has one, counterclockwise. */
function readRotate(fn: PdfFunctions, mem: PdfRuntimeMemory, annotPtr: Ptr): number | undefined {
  if (!fn.FPDFAnnot_HasKey(annotPtr, 'Rotate')) return undefined;
  return withScratch(mem, F32_BYTES, (buf) =>
    fn.EPDFAnnot_GetRotate(annotPtr, buf) ? readF32(mem, buf) : undefined,
  );
}

/** Our keys, as written. */
function readRecorded(fn: PdfFunctions, mem: PdfRuntimeMemory, annotPtr: Ptr): Turn | undefined {
  if (!fn.EPDFAnnot_HasEmbedMetadata(annotPtr)) return undefined;
  const degrees = withScratch(mem, F32_BYTES, (buf) =>
    fn.EPDFAnnot_GetEmbedMetadataNumber(annotPtr, 'Rotation', buf)
      ? normalizeDegrees(readF32(mem, buf))
      : undefined,
  );
  if (degrees === undefined || angleBetween(degrees, 0) < RECORDED_MIN) return undefined;
  const box = withScratch(mem, RECTF_BYTES, (buf) =>
    fn.EPDFAnnot_GetEmbedMetadataRect(annotPtr, 'UnrotatedRect', buf)
      ? normalizePdfRect(readRectF(mem, buf))
      : undefined,
  );
  if (!box || box.right <= box.left || box.top <= box.bottom) return undefined;
  return { degrees, box };
}

/** The turn the appearance is drawn with, as a viewer places it (rule 2). */
function readDrawn(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  rotate: number | undefined,
): Turn | undefined {
  return withScratch(mem, RECTF_BYTES, (boxPtr) =>
    withScratch(mem, MATRIXF_BYTES, (matrixPtr) => {
      if (!fn.EPDFAnnot_GetAppearanceTransform(annotPtr, boxPtr, matrixPtr)) return undefined;
      const m = readMatrixF(mem, matrixPtr);
      const turn = matrixTurn(m);
      if (turn === undefined) return undefined;
      const form = normalizePdfRect(readRectF(mem, boxPtr));
      const scale = Math.hypot(m.a, m.b);
      const cx = (form.left + form.right) / 2;
      const cy = (form.bottom + form.top) / 2;
      const x = m.a * cx + m.c * cy + m.e;
      const y = m.b * cx + m.d * cy + m.f;
      const halfWidth = ((form.right - form.left) * scale) / 2;
      const halfHeight = ((form.top - form.bottom) * scale) / 2;
      const degrees =
        rotate !== undefined && isSameTurn(rotate, turn)
          ? normalizeDegrees(rotate)
          : Math.round(turn * 100) / 100;
      return {
        degrees,
        box: {
          left: x - halfWidth,
          bottom: y - halfHeight,
          right: x + halfWidth,
          top: y + halfHeight,
        },
      };
    }),
  );
}

/** The upright box around the shape: `/Rect` less `/RD`, or `/Rect` when `/RD` leaves nothing. */
function uprightShape(fn: PdfFunctions, mem: PdfRuntimeMemory, annotPtr: Ptr): PdfRect {
  const rect = normalizePdfRect(readAnnotRect(fn, mem, annotPtr));
  const rd = readRectangleDifferences(fn, mem, annotPtr);
  if (!rd) return rect;
  const shape = {
    left: rect.left + rd.left,
    bottom: rect.bottom + rd.bottom,
    right: rect.right - rd.right,
    top: rect.top - rd.top,
  };
  return shape.left <= shape.right && shape.bottom <= shape.top ? shape : rect;
}

/** The turn a box kind is drawn with (clockwise, the API's), or `undefined` when it's drawn upright. */
export function readAnnotationTurn(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
): AnnotationTurn | undefined {
  const turn = readTurn(fn, mem, annotPtr);
  if (!turn) return undefined;
  const rotation = clockwiseFromPdf(turn.degrees);
  return rotation === undefined ? undefined : { rotation, box: turn.box };
}

/** A box kind's box and turn: the turned box, or upright `/Rect` less `/RD`. */
export function readAnnotationBox(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
): AnnotationBox {
  const turn = readAnnotationTurn(fn, mem, annotPtr);
  return turn
    ? { box: turn.box, rotation: turn.rotation }
    : { box: uprightShape(fn, mem, annotPtr), rotation: null };
}

function readTurn(fn: PdfFunctions, mem: PdfRuntimeMemory, annotPtr: Ptr): Turn | undefined {
  const subtype = fn.FPDFAnnot_GetSubtype(annotPtr);
  if (!BOX_KINDS.has(subtype)) return undefined;
  const rotate = readRotate(fn, mem, annotPtr);
  const drawn = readDrawn(fn, mem, annotPtr, rotate);
  const frame = uprightShape(fn, mem, annotPtr);
  const isFreeText = subtype === PdfAnnotationSubtypeCode.FREETEXT;
  const quarter =
    isFreeText && rotate !== undefined
      ? QUARTER_TURNS.find((candidate) => isSameTurn(rotate, candidate))
      : undefined;

  const recorded = readRecorded(fn, mem, annotPtr);
  if (recorded && isSamePdfRect(pdfRectTurnedBounds(recorded.box, recorded.degrees), frame)) {
    const drawnAgrees = drawn
      ? isSameTurn(drawn.degrees, recorded.degrees)
      : // No turn in the drawing's matrix: nothing drawn contradicts it, or a
        // free text draws its turn inside its stream (a callout always, a text
        // box Acrobat turned a quarter with its /Rotate).
        !fn.EPDFAnnot_HasAppearanceStream(annotPtr, 0) ||
        (isFreeText &&
          (fn.FPDFAnnot_HasKey(annotPtr, 'CL') ||
            (quarter !== undefined && isSameTurn(quarter, recorded.degrees))));
    if (drawnAgrees) return recorded;
  }
  if (drawn) return drawn;
  if (quarter === undefined) return undefined;
  // A quarter turn keeps the frame upright: the box is the frame, its sides swapped.
  if (quarter === 180) return { degrees: quarter, box: frame };
  const x = (frame.left + frame.right) / 2;
  const y = (frame.bottom + frame.top) / 2;
  const halfWidth = (frame.top - frame.bottom) / 2;
  const halfHeight = (frame.right - frame.left) / 2;
  return {
    degrees: quarter,
    box: { left: x - halfWidth, bottom: y - halfHeight, right: x + halfWidth, top: y + halfHeight },
  };
}

/** Our keys as written, the API's way (clockwise), for comparing with the read. */
export function readRecordedAnnotationTurn(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
): AnnotationTurn | undefined {
  const recorded = readRecorded(fn, mem, annotPtr);
  if (!recorded) return undefined;
  const rotation = clockwiseFromPdf(recorded.degrees);
  return rotation === undefined ? undefined : { rotation, box: recorded.box };
}

/** Whether two turns are the same, within what a file's numbers hold. */
export function isSameAnnotationTurn(
  turn: AnnotationTurn | undefined,
  other: AnnotationTurn | undefined,
): boolean {
  if (!turn || !other) return !turn && !other;
  return isSameTurn(turn.rotation, other.rotation) && isSamePdfRect(turn.box, other.box);
}

/** Whether the annotation is a kind that turns as a box. */
export function isTurnableBoxKind(fn: PdfFunctions, annotPtr: Ptr): boolean {
  return BOX_KINDS.has(fn.FPDFAnnot_GetSubtype(annotPtr));
}
