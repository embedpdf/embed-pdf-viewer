import {
  EngineError,
  EngineErrorCode,
  type PopupDraft,
  type PopupPatch,
} from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { setAnnotRect } from './annotationWritePrimitives';
import { applyAnnotationBaseDraft, applyAnnotationBasePatch } from './writeAnnotationBase';

/**
 * Apply a popup draft: its base fields and its window rect. The `/Parent`
 * link and the parent's `/Popup` back-reference need the parent resolved on
 * the page, so the mutator writes them.
 */
export function applyPopupDraft(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  draft: PopupDraft,
): void {
  applyAnnotationBaseDraft(fn, mem, annotPtr, draft);
  setAnnotRect(fn, mem, annotPtr, draft.rect);
  if (draft.open !== undefined) setPopupOpen(fn, annotPtr, draft.open);
}

export function applyPopupPatch(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  patch: PopupPatch,
): void {
  applyAnnotationBasePatch(fn, mem, annotPtr, patch);
  if (patch.rect !== undefined) setAnnotRect(fn, mem, annotPtr, patch.rect);
  if (patch.open !== undefined) setPopupOpen(fn, annotPtr, patch.open);
}

function setPopupOpen(fn: PdfFunctions, annotPtr: Ptr, open: boolean): void {
  if (!fn.EPDFAnnot_SetBooleanValue(annotPtr, 'Open', open)) {
    throw new EngineError(EngineErrorCode.Unknown, 'EPDFAnnot_SetBooleanValue returned false');
  }
}

export function isPopupSubtype(subtype: string): subtype is 'popup' {
  return subtype === 'popup';
}
