import type { LineDraft, LinePatch, PdfCoordinates } from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { setLine, setLineEndings } from './annotationWritePrimitives';
import { applyAnnotationBaseDraft, applyAnnotationBasePatch } from './writeAnnotationBase';
import { readCurrentPoints, updatePoints, writeNewPoints } from './writeAnnotationPoints';
import { writeMeasurementFields } from './writeMeasurementFields';
import { applyFilledStyleDraft, applyFilledStylePatch } from './writeStyle';

/** Default line endings when a line draft omits them. */
const DEFAULT_LINE_ENDINGS = { start: 'none', end: 'none' } as const;

/**
 * Apply a line draft to a freshly-created annotation. Order:
 *   1. base author-metadata (contents/nm)
 *   2. shared stroke/fill styling (/C, /CA, /BS, dash)
 *   3. /L line geometry, turned by `rotation` (`writeAnnotationPoints`); the
 *      appearance then sets /Rect to what it paints
 *   4. /LE line endings (default none/none)
 */
export function applyLineDraft(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  draft: LineDraft<PdfCoordinates>,
): void {
  applyAnnotationBaseDraft(fn, mem, annotPtr, draft);
  writeMeasurementFields(fn, mem, annotPtr, draft);
  applyFilledStyleDraft(fn, mem, annotPtr, draft);
  const { start, end } = draft.linePoints;
  const [drawn] = writeNewPoints(fn, mem, annotPtr, [[start, end]], draft.rotation).drawn;
  setLine(fn, mem, annotPtr, { start: drawn![0]!, end: drawn![1]! });
  setLineEndings(fn, annotPtr, draft.lineEndings ?? DEFAULT_LINE_ENDINGS);
}

export function applyLinePatch(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  patch: LinePatch<PdfCoordinates>,
): void {
  applyAnnotationBasePatch(fn, mem, annotPtr, patch);
  writeMeasurementFields(fn, mem, annotPtr, patch);
  applyFilledStylePatch(fn, mem, annotPtr, patch);
  const points = patch.linePoints && [[patch.linePoints.start, patch.linePoints.end]];
  const placed = updatePoints(
    fn,
    mem,
    annotPtr,
    readCurrentPoints(fn, mem, annotPtr),
    points,
    patch.rotation,
  );
  if (placed) {
    const [drawn] = placed.drawn;
    setLine(fn, mem, annotPtr, { start: drawn![0]!, end: drawn![1]! });
  }
  if (patch.lineEndings !== undefined) {
    setLineEndings(fn, annotPtr, patch.lineEndings);
  }
}

/**
 * Type-narrowing predicate used by the writer registry to pick the line
 * writer for a draft/patch's `subtype`.
 */
export function isLineSubtype(subtype: string): subtype is 'line' {
  return subtype === 'line';
}
