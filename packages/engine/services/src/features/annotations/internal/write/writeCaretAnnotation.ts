import type { CaretDraft, CaretPatch, Color, PdfCoordinates } from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import {
  setAnnotColor,
  setAnnotOpacity,
  setIntent,
  setIntentOrClear,
} from './annotationWritePrimitives';
import { applyAnnotationBaseDraft, applyAnnotationBasePatch } from './writeAnnotationBase';
import { applyAnnotationBoxPatch, writeAnnotationBox } from './writeAnnotationBox';
import { caretIntentToName } from '../textEditIntent';

/** Default `/C` colour when a caret draft omits it (engine-wide default mark). */
const DEFAULT_CARET_COLOR: Color = { r: 255, g: 0, b: 0 };

/** Default opacity, set explicitly so reads always round-trip the same value. */
const DEFAULT_OPACITY = 1;

/**
 * Apply a caret draft to a freshly-created annotation. The caret symbol
 * fills its box. Order:
 *   1. base author-metadata (contents/nm/flags)
 *   2. the box and its turn, before the appearance is drawn
 *   3. `/C` color + `/CA` opacity
 */
export function applyCaretDraft(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  draft: CaretDraft<PdfCoordinates>,
): void {
  applyAnnotationBaseDraft(fn, mem, annotPtr, draft);
  writeAnnotationBox(fn, mem, annotPtr, { box: draft.box, rotation: draft.rotation ?? null });
  setAnnotColor(fn, annotPtr, draft.color ?? DEFAULT_CARET_COLOR);
  setAnnotOpacity(fn, annotPtr, draft.opacity ?? DEFAULT_OPACITY);
  if (draft.intent != null) setIntent(fn, annotPtr, caretIntentToName(draft.intent));
}

/**
 * Apply a caret patch to an existing annotation. Only present fields are
 * touched.
 */
export function applyCaretPatch(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  patch: CaretPatch<PdfCoordinates>,
): void {
  applyAnnotationBasePatch(fn, mem, annotPtr, patch);
  applyAnnotationBoxPatch(fn, mem, annotPtr, patch);
  if (patch.color !== undefined) {
    setAnnotColor(fn, annotPtr, patch.color);
  }
  if (patch.opacity !== undefined) {
    setAnnotOpacity(fn, annotPtr, patch.opacity);
  }
  if (patch.intent !== undefined) {
    setIntentOrClear(fn, annotPtr, patch.intent === null ? null : caretIntentToName(patch.intent));
  }
}

/**
 * Type-narrowing predicate used by the writer registry to pick the caret
 * writer for a draft/patch's `subtype`.
 */
export function isCaretSubtype(subtype: string): subtype is 'caret' {
  return subtype === 'caret';
}
