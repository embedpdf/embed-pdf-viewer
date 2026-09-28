import type { InkDraft, InkPatch, PdfCoordinates } from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { setInkList, setIntent, setIntentOrClear } from './annotationWritePrimitives';
import { applyAnnotationBaseDraft, applyAnnotationBasePatch } from './writeAnnotationBase';
import { readCurrentPoints, updatePoints, writeNewPoints } from './writeAnnotationPoints';
import { applyGeometryStyleDraft, applyGeometryStylePatch } from './writeStyle';
import { inkIntentToName } from '../inkIntent';

/**
 * Apply an ink draft to a freshly-created annotation. Ink has a stroke but
 * no `/IC`, so it uses the geometry styling layer (not the filled one).
 * Order:
 *   1. base author-metadata (contents/nm)
 *   2. geometry styling (/C, /CA, /BS, dash)
 *   3. /InkList freehand strokes, turned by `rotation`
 *      (`writeAnnotationPoints`); the appearance then sets /Rect to what it
 *      paints
 */
export function applyInkDraft(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  draft: InkDraft<PdfCoordinates>,
): void {
  applyAnnotationBaseDraft(fn, mem, annotPtr, draft);
  if (draft.intent != null) setIntent(fn, annotPtr, inkIntentToName(draft.intent));
  applyGeometryStyleDraft(fn, mem, annotPtr, draft);
  setInkList(
    fn,
    mem,
    annotPtr,
    writeNewPoints(fn, mem, annotPtr, draft.inkList, draft.rotation).drawn,
  );
}

export function applyInkPatch(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  patch: InkPatch<PdfCoordinates>,
): void {
  applyAnnotationBasePatch(fn, mem, annotPtr, patch);
  if (patch.intent !== undefined) {
    setIntentOrClear(fn, annotPtr, patch.intent === null ? null : inkIntentToName(patch.intent));
  }
  applyGeometryStylePatch(fn, mem, annotPtr, patch);
  const placed = updatePoints(
    fn,
    mem,
    annotPtr,
    readCurrentPoints(fn, mem, annotPtr),
    patch.inkList,
    patch.rotation,
  );
  if (placed) setInkList(fn, mem, annotPtr, placed.drawn);
}

/**
 * Type-narrowing predicate used by the writer registry to pick the ink
 * writer for a draft/patch's `subtype`.
 */
export function isInkSubtype(subtype: string): subtype is 'ink' {
  return subtype === 'ink';
}
