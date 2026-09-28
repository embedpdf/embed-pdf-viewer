import {
  pdfPointTurned,
  type PdfPoint,
  type PdfPointTurn,
  type PolygonDraft,
  type PolygonPatch,
  type PolylineDraft,
  type PolylinePatch,
} from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import {
  clearBorderEffect,
  setBorderEffect,
  setLineEndings,
  setVertices,
} from './annotationWritePrimitives';
import { applyAnnotationBaseDraft, applyAnnotationBasePatch } from './writeAnnotationBase';
import {
  readCurrentPoints,
  updatePoints,
  writeNewPoints,
  type CurrentPoints,
  type PlacedPoints,
} from './writeAnnotationPoints';
import { writeMeasurementFields } from './writeMeasurementFields';
import { applyFilledStyleDraft, applyFilledStylePatch } from './writeStyle';
import { readShapeCaption } from '../read/readMeasurementFields';
import { uprightPoint } from '../read/readPointsTurn';

export type VertexDraft = PolygonDraft | PolylineDraft;
export type VertexPatch = PolygonPatch | PolylinePatch;

/** Default line endings when a polyline draft omits them. */
const DEFAULT_LINE_ENDINGS = { start: 'none', end: 'none' } as const;

type VertexWrite = VertexDraft | VertexPatch;

const drawnPoint = (point: PdfPoint, turn: PdfPointTurn | null | undefined): PdfPoint =>
  turn ? pdfPointTurned(point, turn) : point;

/** A create's caption center, given upright, turned with the vertices. */
function draftWithDrawnCaption<T extends VertexWrite>(draft: T, placed: PlacedPoints): T {
  return draft.captionCenter
    ? { ...draft, captionCenter: drawnPoint(draft.captionCenter, placed.turn) }
    : draft;
}

/**
 * An update's caption center, given upright, turned with the vertices. When
 * the vertices or their turn change and the caption isn't sent, a manual
 * center is written again under the new turn, so it stays where it was on
 * the shape.
 */
function patchWithDrawnCaption<T extends VertexPatch>(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  patch: T,
  current: CurrentPoints,
  placed: PlacedPoints | undefined,
): T {
  const turn = placed ? placed.turn : current.turn;
  if (patch.captionCenter) {
    return { ...patch, captionCenter: drawnPoint(patch.captionCenter, turn) };
  }
  if (!placed || patch.captionEnabled !== undefined) return patch;
  const caption = readShapeCaption(fn, mem, annotPtr);
  if (!caption?.center) return patch;
  return {
    ...patch,
    captionEnabled: caption.enabled,
    captionCenter: drawnPoint(uprightPoint(caption.center, current.turn), turn),
  };
}

/**
 * Apply a polygon draft to a freshly-created annotation. Order:
 *   1. base author-metadata (contents/nm)
 *   2. /Vertices geometry, turned by `rotation` (`writeAnnotationPoints`);
 *      the appearance then sets /Rect to what it paints
 *   3. measurement fields, a caption center turned with the vertices
 *   4. shared stroke/fill styling (/IC, /C, /CA, /BS, dash)
 *   5. optional cloudy (/BE)
 *
 * Note: polygon does not use /RD (rectangle differences) — its geometry is
 * fully described by /Vertices + /Rect, so /RD is redundant. Per ISO 32000
 * /RD applies to Square/Circle (and FreeText/Caret), not Polygon.
 */
export function applyPolygonDraft(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  draft: PolygonDraft,
): void {
  applyAnnotationBaseDraft(fn, mem, annotPtr, draft);
  const placed = writeNewPoints(fn, mem, annotPtr, [draft.vertices], draft.rotation);
  writeMeasurementFields(fn, mem, annotPtr, draftWithDrawnCaption(draft, placed));
  applyFilledStyleDraft(fn, mem, annotPtr, draft);
  setVertices(fn, mem, annotPtr, placed.drawn[0]!);

  if (draft.cloudyIntensity != null && draft.cloudyIntensity > 0) {
    setBorderEffect(fn, annotPtr, draft.cloudyIntensity);
  }
}

export function applyPolygonPatch(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  patch: PolygonPatch,
): void {
  applyAnnotationBasePatch(fn, mem, annotPtr, patch);
  applyVertexGeometryPatch(fn, mem, annotPtr, patch);
  applyFilledStylePatch(fn, mem, annotPtr, patch);
  if (patch.cloudyIntensity !== undefined) {
    if (patch.cloudyIntensity !== null && patch.cloudyIntensity > 0) {
      setBorderEffect(fn, annotPtr, patch.cloudyIntensity);
    } else {
      // `null` removes /BE (tri-state). The schema forbids 0, but treat any
      // non-positive value defensively as a clear — never write a degenerate
      // /BE the read side would normalize away.
      clearBorderEffect(fn, annotPtr);
    }
  }
}

/**
 * Apply a polyline draft to a freshly-created annotation. Order:
 *   1. base author-metadata (contents/nm)
 *   2. /Vertices geometry, turned by `rotation` (`writeAnnotationPoints`);
 *      the appearance then sets /Rect to what it paints
 *   3. measurement fields, a caption center turned with the vertices
 *   4. shared stroke/fill styling (/IC, /C, /CA, /BS, dash)
 *   5. /LE line endings (default none/none)
 */
export function applyPolylineDraft(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  draft: PolylineDraft,
): void {
  applyAnnotationBaseDraft(fn, mem, annotPtr, draft);
  const placed = writeNewPoints(fn, mem, annotPtr, [draft.vertices], draft.rotation);
  writeMeasurementFields(fn, mem, annotPtr, draftWithDrawnCaption(draft, placed));
  applyFilledStyleDraft(fn, mem, annotPtr, draft);
  setVertices(fn, mem, annotPtr, placed.drawn[0]!);
  setLineEndings(fn, annotPtr, draft.lineEndings ?? DEFAULT_LINE_ENDINGS);
}

export function applyPolylinePatch(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  patch: PolylinePatch,
): void {
  applyAnnotationBasePatch(fn, mem, annotPtr, patch);
  applyVertexGeometryPatch(fn, mem, annotPtr, patch);
  applyFilledStylePatch(fn, mem, annotPtr, patch);
  if (patch.lineEndings !== undefined) {
    setLineEndings(fn, annotPtr, patch.lineEndings);
  }
}

/** An update's vertices, turn and measurement fields, a caption center turned with them. */
function applyVertexGeometryPatch(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  patch: VertexPatch,
): void {
  const current = readCurrentPoints(fn, mem, annotPtr);
  const vertices = patch.vertices && [patch.vertices];
  const placed = updatePoints(fn, mem, annotPtr, current, vertices, patch.rotation);
  writeMeasurementFields(
    fn,
    mem,
    annotPtr,
    patchWithDrawnCaption(fn, mem, annotPtr, patch, current, placed),
  );
  if (placed) setVertices(fn, mem, annotPtr, placed.drawn[0]!);
}

/**
 * Type-narrowing predicate used by the writer registry to pick the vertex
 * writer for a draft/patch's `subtype`.
 */
export function isVertexSubtype(subtype: string): subtype is 'polygon' | 'polyline' {
  return subtype === 'polygon' || subtype === 'polyline';
}
