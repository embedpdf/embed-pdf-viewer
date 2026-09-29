import type { TextDraft, TextPatch, PdfCoordinates } from '@embedpdf/engine-core/runtime';
import { ANNOTATION_DEFAULTS, EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { NOTE_ICON_TO_NAME } from '../annotationIcon';
import { stateModelToPdf, stateToPdf } from '../annotationState';
import {
  setAnnotColor,
  setAnnotOpacity,
  setAnnotRect,
  writeAnnotString,
  writeAnnotStringOrClear,
} from './annotationWritePrimitives';
import { applyAnnotationBaseDraft, applyAnnotationBasePatch } from './writeAnnotationBase';

/** A note's defaults: the generator's yellow fill, set explicitly so reads round-trip. */
const DEFAULTS = ANNOTATION_DEFAULTS.text;

/**
 * Apply a text (sticky-note) draft. The visual is entirely generator-owned:
 * the closing appearance pass (`generateAppearance`) draws the note icon from
 * `/C` + `/Name` (GenerateTextAP), filling `/Rect`, so this writer only
 * records where and the state. `/State` + `/StateModel` are dictionary-only
 * (ISO 32000 §12.5.6.3) and never reach the generator.
 */
export function applyTextDraft(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  draft: TextDraft<PdfCoordinates>,
): void {
  applyAnnotationBaseDraft(fn, mem, annotPtr, draft);
  setAnnotRect(fn, mem, annotPtr, draft.rect);
  setAnnotColor(fn, annotPtr, draft.color ?? DEFAULTS.color);
  setAnnotOpacity(fn, annotPtr, draft.opacity ?? DEFAULTS.opacity);
  setNoteIcon(fn, annotPtr, draft.icon ?? DEFAULTS.icon);
  // `pdfResolveAnnotationDraft` filled in a standard state's model.
  if (draft.stateModel != null) {
    writeAnnotString(fn, mem, annotPtr, 'StateModel', stateModelToPdf(draft.stateModel));
  }
  if (draft.state != null) {
    writeAnnotString(fn, mem, annotPtr, 'State', stateToPdf(draft.state));
  }
}

export function applyTextPatch(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  patch: TextPatch<PdfCoordinates>,
): void {
  applyAnnotationBasePatch(fn, mem, annotPtr, patch);
  if (patch.rect !== undefined) setAnnotRect(fn, mem, annotPtr, patch.rect);
  if (patch.color !== undefined) {
    setAnnotColor(fn, annotPtr, patch.color);
  }
  if (patch.opacity !== undefined) {
    setAnnotOpacity(fn, annotPtr, patch.opacity);
  }
  if (patch.icon !== undefined) {
    setNoteIcon(fn, annotPtr, patch.icon);
  }
  // Three-state; `pdfResolveAnnotationPatch` filled in a new state's model.
  if (patch.stateModel !== undefined) {
    writeAnnotStringOrClear(
      fn,
      mem,
      annotPtr,
      'StateModel',
      patch.stateModel === null ? null : stateModelToPdf(patch.stateModel),
    );
  }
  if (patch.state !== undefined) {
    writeAnnotStringOrClear(
      fn,
      mem,
      annotPtr,
      'State',
      patch.state === null ? null : stateToPdf(patch.state),
    );
  }
}

export function isTextSubtype(subtype: string): subtype is 'text' {
  return subtype === 'text';
}

function setNoteIcon(fn: PdfFunctions, annotPtr: Ptr, icon: keyof typeof NOTE_ICON_TO_NAME): void {
  if (!fn.EPDFAnnot_SetName(annotPtr, NOTE_ICON_TO_NAME[icon])) {
    throw new EngineError(EngineErrorCode.Unknown, 'EPDFAnnot_SetName returned false');
  }
}
