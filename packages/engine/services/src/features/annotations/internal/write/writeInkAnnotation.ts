import type { InkDraft, InkPatch } from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { setAnnotRect, setInkList, setIntent } from './annotationWritePrimitives';
import { applyAnnotationBaseDraft, applyAnnotationBasePatch } from './writeAnnotationBase';
import { applyGeometryStyleDraft, applyGeometryStylePatch } from './writeStyle';
import { writeVertexTransformMetadata } from './writeAnnotationTransformMetadata';
import { inkIntentToName } from '../inkIntent';

/**
 * Apply an ink draft to a freshly-created annotation. Ink has a stroke but
 * no `/IC`, so it uses the geometry styling layer (not the filled one).
 * Order:
 *   1. base author-metadata (contents/nm)
 *   2. /Rect (required — supplied by the plugin; the engine never derives it)
 *   3. geometry styling (/C, /CA, /BS, dash)
 *   4. /InkList freehand strokes
 */
export function applyInkDraft(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  draft: InkDraft,
): void {
  applyAnnotationBaseDraft(fn, mem, annotPtr, draft);
  if (draft.intent !== undefined) setIntent(fn, annotPtr, inkIntentToName(draft.intent));
  setAnnotRect(fn, mem, annotPtr, draft.rect);
  applyGeometryStyleDraft(fn, mem, annotPtr, draft);
  setInkList(fn, mem, annotPtr, draft.inkList);
  // Advisory rotation: the strokes are already rotated; this just records θ.
  writeVertexTransformMetadata(fn, annotPtr, { rotation: draft.rotation });
}

export function applyInkPatch(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  patch: InkPatch,
): void {
  applyAnnotationBasePatch(fn, mem, annotPtr, patch);
  if (patch.intent !== undefined) setIntent(fn, annotPtr, inkIntentToName(patch.intent));
  if (patch.rect !== undefined) {
    setAnnotRect(fn, mem, annotPtr, patch.rect);
  }
  applyGeometryStylePatch(fn, mem, annotPtr, patch);
  if (patch.inkList !== undefined) {
    setInkList(fn, mem, annotPtr, patch.inkList);
    // Reconcile advisory rotation only when the geometry was (re)written.
    writeVertexTransformMetadata(fn, annotPtr, { rotation: patch.rotation });
  }
}

/**
 * Type-narrowing predicate used by the writer registry to pick the ink
 * writer for a draft/patch's `subtype`.
 */
export function isInkSubtype(subtype: string): subtype is 'ink' {
  return subtype === 'ink';
}
