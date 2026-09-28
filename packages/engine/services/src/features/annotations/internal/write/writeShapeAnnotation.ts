import {
  type CircleDraft,
  type CirclePatch,
  type SquareDraft,
  type SquarePatch,
} from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { clearBorderEffect, setBorderEffect } from './annotationWritePrimitives';
import { applyAnnotationBaseDraft, applyAnnotationBasePatch } from './writeAnnotationBase';
import { applyAnnotationBoxPatch, writeAnnotationBox } from './writeAnnotationBox';
import { applyFilledStyleDraft, applyFilledStylePatch } from './writeStyle';

export type ShapeDraft = CircleDraft | SquareDraft;
export type ShapePatch = CirclePatch | SquarePatch;

/**
 * Apply a shape draft to a freshly-created annotation. Caller is
 * responsible for `EPDFPage_CreateAnnot`; this function only writes
 * fields. Order:
 *   1. base author-metadata (contents/nm)
 *   2. the box and its turn (`/Rect`; the appearance then takes in its
 *      border and writes `/RD`)
 *   3. shared stroke/fill styling (/IC, /C, /CA, /BS, dash)
 *   4. optional cloudy (/BE)
 */
export function applyShapeDraft(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  draft: ShapeDraft,
): void {
  applyAnnotationBaseDraft(fn, mem, annotPtr, draft);

  writeAnnotationBox(fn, mem, annotPtr, { box: draft.box, rotation: draft.rotation ?? null });
  applyFilledStyleDraft(fn, mem, annotPtr, draft);

  if (draft.cloudyIntensity != null && draft.cloudyIntensity > 0) {
    setBorderEffect(fn, annotPtr, draft.cloudyIntensity);
  }
}

/**
 * Apply a shape patch to an existing annotation. Only fields present on
 * the patch are touched; `cloudyIntensity` is tri-state (as
 * `interiorColor`): a value sets the entry, `null` removes it.
 */
export function applyShapePatch(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  patch: ShapePatch,
): void {
  applyAnnotationBasePatch(fn, mem, annotPtr, patch);

  applyAnnotationBoxPatch(fn, mem, annotPtr, patch);
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
 * Type-narrowing predicate. Mirrors the reader-side dispatch. Used by the
 * writer registry to pick the shape writer for a draft/patch's `subtype`.
 */
export function isShapeSubtype(subtype: string): subtype is 'circle' | 'square' {
  return subtype === 'circle' || subtype === 'square';
}
