import type { CaretDraft, CaretPatch, Color } from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import {
  setAnnotColor,
  setAnnotOpacity,
  setAnnotRect,
  setIntent,
  setRectangleDifferences,
} from './annotationWritePrimitives';
import { applyAnnotationBaseDraft, applyAnnotationBasePatch } from './writeAnnotationBase';
import { caretIntentToName } from '../textEditIntent';

/** Default `/C` colour when a caret draft omits it (engine-wide default mark). */
const DEFAULT_CARET_COLOR: Color = { r: 255, g: 0, b: 0 };

/** Default opacity, set explicitly so reads always round-trip the same value. */
const DEFAULT_OPACITY = 1;

/**
 * Apply a caret draft to a freshly-created annotation. Caret carries no
 * geometry of its own beyond `/Rect`. Order:
 *   1. base author-metadata (contents/nm/flags)
 *   2. `/Rect` (required — supplied by the caller; never derived)
 *   3. `/C` color + `/CA` opacity
 *   4. `/RD` rectangle differences (optional)
 */
export function applyCaretDraft(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  draft: CaretDraft,
): void {
  applyAnnotationBaseDraft(fn, mem, annotPtr, draft);
  setAnnotRect(fn, mem, annotPtr, draft.rect);
  setAnnotColor(fn, annotPtr, draft.color ?? DEFAULT_CARET_COLOR);
  setAnnotOpacity(fn, annotPtr, draft.opacity ?? DEFAULT_OPACITY);
  if (draft.intent !== undefined) setIntent(fn, annotPtr, caretIntentToName(draft.intent));
  if (draft.rectDifferences !== undefined) {
    setRectangleDifferences(fn, annotPtr, draft.rectDifferences);
  }
}

/**
 * Apply a caret patch to an existing annotation. Only present fields are
 * touched.
 */
export function applyCaretPatch(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  patch: CaretPatch,
): void {
  applyAnnotationBasePatch(fn, mem, annotPtr, patch);
  if (patch.rect !== undefined) {
    setAnnotRect(fn, mem, annotPtr, patch.rect);
  }
  if (patch.color !== undefined) {
    setAnnotColor(fn, annotPtr, patch.color);
  }
  if (patch.opacity !== undefined) {
    setAnnotOpacity(fn, annotPtr, patch.opacity);
  }
  if (patch.intent !== undefined) {
    setIntent(fn, annotPtr, caretIntentToName(patch.intent));
  }
  if (patch.rectDifferences !== undefined) {
    setRectangleDifferences(fn, annotPtr, patch.rectDifferences);
  }
}

/**
 * Type-narrowing predicate used by the writer registry to pick the caret
 * writer for a draft/patch's `subtype`.
 */
export function isCaretSubtype(subtype: string): subtype is 'caret' {
  return subtype === 'caret';
}
