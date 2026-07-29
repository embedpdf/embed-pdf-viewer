import type {
  PolygonDraft,
  PolygonPatch,
  PolylineDraft,
  PolylinePatch,
} from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import {
  clearBorderEffect,
  setAnnotRect,
  setBorderEffect,
  setLineEndings,
  setVertices,
} from './annotationWritePrimitives';
import { applyAnnotationBaseDraft, applyAnnotationBasePatch } from './writeAnnotationBase';
import { applyFilledStyleDraft, applyFilledStylePatch } from './writeStyle';
import { writeVertexTransformMetadata } from './writeAnnotationTransformMetadata';

export type VertexDraft = PolygonDraft | PolylineDraft;
export type VertexPatch = PolygonPatch | PolylinePatch;

/** Default line endings when a polyline draft omits them. */
const DEFAULT_LINE_ENDINGS = { start: 'none', end: 'none' } as const;

/**
 * Apply a polygon draft to a freshly-created annotation. Order:
 *   1. base author-metadata (contents/nm)
 *   2. /Rect (required — supplied by the plugin; the engine never derives it)
 *   3. shared stroke/fill styling (/IC, /C, /CA, /BS, dash)
 *   4. /Vertices geometry
 *   5. optional cloudy (/BE)
 *
 * Note: polygon does NOT use /RD (rectangle differences) — its geometry is
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
  setAnnotRect(fn, mem, annotPtr, draft.rect);
  applyFilledStyleDraft(fn, mem, annotPtr, draft);
  setVertices(fn, mem, annotPtr, draft.vertices);

  if (draft.cloudyIntensity != null && draft.cloudyIntensity > 0) {
    setBorderEffect(fn, annotPtr, draft.cloudyIntensity);
  }
  // Advisory rotation: the vertices are already rotated; this just records θ.
  writeVertexTransformMetadata(fn, annotPtr, { rotation: draft.rotation });
}

export function applyPolygonPatch(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  patch: PolygonPatch,
): void {
  applyAnnotationBasePatch(fn, mem, annotPtr, patch);
  if (patch.rect !== undefined) {
    setAnnotRect(fn, mem, annotPtr, patch.rect);
  }
  applyFilledStylePatch(fn, mem, annotPtr, patch);
  if (patch.vertices !== undefined) {
    setVertices(fn, mem, annotPtr, patch.vertices);
  }
  // Advisory rotation is tri-state (undefined preserves, null/0 clears).
  writeVertexTransformMetadata(fn, annotPtr, { rotation: patch.rotation });
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
 *   2. /Rect (required — supplied by the plugin)
 *   3. shared stroke/fill styling (/IC, /C, /CA, /BS, dash)
 *   4. /Vertices geometry
 *   5. /LE line endings (default none/none)
 */
export function applyPolylineDraft(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  draft: PolylineDraft,
): void {
  applyAnnotationBaseDraft(fn, mem, annotPtr, draft);
  setAnnotRect(fn, mem, annotPtr, draft.rect);
  applyFilledStyleDraft(fn, mem, annotPtr, draft);
  setVertices(fn, mem, annotPtr, draft.vertices);
  setLineEndings(fn, annotPtr, draft.lineEndings ?? DEFAULT_LINE_ENDINGS);
  // Advisory rotation: the vertices are already rotated; this just records θ.
  writeVertexTransformMetadata(fn, annotPtr, { rotation: draft.rotation });
}

export function applyPolylinePatch(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  patch: PolylinePatch,
): void {
  applyAnnotationBasePatch(fn, mem, annotPtr, patch);
  if (patch.rect !== undefined) {
    setAnnotRect(fn, mem, annotPtr, patch.rect);
  }
  applyFilledStylePatch(fn, mem, annotPtr, patch);
  if (patch.vertices !== undefined) {
    setVertices(fn, mem, annotPtr, patch.vertices);
  }
  // Advisory rotation is tri-state (undefined preserves, null/0 clears).
  writeVertexTransformMetadata(fn, annotPtr, { rotation: patch.rotation });
  if (patch.lineEndings !== undefined) {
    setLineEndings(fn, annotPtr, patch.lineEndings);
  }
}

/**
 * Type-narrowing predicate used by the writer registry to pick the vertex
 * writer for a draft/patch's `subtype`.
 */
export function isVertexSubtype(subtype: string): subtype is 'polygon' | 'polyline' {
  return subtype === 'polygon' || subtype === 'polyline';
}
