import {
  type CircleDraft,
  type CirclePatch,
  type SquareDraft,
  type SquarePatch,
} from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import {
  clearBorderEffect,
  setAnnotRect,
  setBorderEffect,
  setRectangleDifferences,
} from './annotationWritePrimitives';
import { applyAnnotationBaseDraft, applyAnnotationBasePatch } from './writeAnnotationBase';
import { applyFilledStyleDraft, applyFilledStylePatch } from './writeStyle';
import { writeBoxTransformMetadata } from './writeAnnotationTransformMetadata';

export type ShapeDraft = CircleDraft | SquareDraft;
export type ShapePatch = CirclePatch | SquarePatch;

/**
 * Apply a shape draft to a freshly-created annotation. Caller is
 * responsible for `EPDFPage_CreateAnnot`; this function only writes
 * fields. Order:
 *   1. base author-metadata (contents/nm)
 *   2. /Rect (required — shapes carry their geometry as /Rect, not quads)
 *   3. shared stroke/fill styling (/IC, /C, /CA, /BS, dash)
 *   4. optional cloudy (/BE), rect-diff (/RD)
 */
export function applyShapeDraft(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  draft: ShapeDraft,
): void {
  applyAnnotationBaseDraft(fn, mem, annotPtr, draft);

  setAnnotRect(fn, mem, annotPtr, draft.rect);
  applyFilledStyleDraft(fn, mem, annotPtr, draft);

  if (draft.cloudyIntensity !== undefined && draft.cloudyIntensity > 0) {
    setBorderEffect(fn, annotPtr, draft.cloudyIntensity);
  }
  if (draft.rectDifferences !== undefined) {
    setRectangleDifferences(fn, annotPtr, draft.rectDifferences);
  }
  // /Rect above is the rotated visual AABB; the rotation metadata tells the AP
  // generator to bake a /Matrix from the unrotated box.
  writeBoxTransformMetadata(fn, mem, annotPtr, {
    rotation: draft.rotation,
    unrotatedRect: draft.unrotatedRect,
  });
}

/**
 * Apply a shape patch to an existing annotation. Only fields present on
 * the patch are touched.
 */
export function applyShapePatch(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  patch: ShapePatch,
): void {
  applyAnnotationBasePatch(fn, mem, annotPtr, patch);

  if (patch.rect !== undefined) {
    setAnnotRect(fn, mem, annotPtr, patch.rect);
    // Reconcile rotation only when geometry was (re)written, so a pure
    // style/colour patch never disturbs an existing rotation.
    writeBoxTransformMetadata(fn, mem, annotPtr, {
      rotation: patch.rotation,
      unrotatedRect: patch.unrotatedRect,
    });
  }
  applyFilledStylePatch(fn, mem, annotPtr, patch);

  if (patch.cloudyIntensity !== undefined) {
    if (patch.cloudyIntensity > 0) {
      setBorderEffect(fn, annotPtr, patch.cloudyIntensity);
    } else {
      clearBorderEffect(fn, annotPtr);
    }
  }
  if (patch.rectDifferences !== undefined) {
    setRectangleDifferences(fn, annotPtr, patch.rectDifferences);
  }
}

/**
 * Type-narrowing predicate. Mirrors the reader-side dispatch. Used by the
 * writer registry to pick the shape writer for a draft/patch's `subtype`.
 */
export function isShapeSubtype(subtype: string): subtype is 'circle' | 'square' {
  return subtype === 'circle' || subtype === 'square';
}
