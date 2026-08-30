import type { Color, TextDraft, TextPatch } from '@embedpdf/engine-core/runtime';
import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { NOTE_ICON_TO_CODE } from '../annotationIcon';
import { stateModelToPdf, stateToPdf } from '../annotationState';
import {
  setAnnotColor,
  setAnnotOpacity,
  setAnnotRect,
  writeAnnotString,
  writeAnnotStringOrClear,
} from './annotationWritePrimitives';
import { applyAnnotationBaseDraft, applyAnnotationBasePatch } from './writeAnnotationBase';

/** Default `/C` — the generator's yellow note fill, set explicitly so reads round-trip. */
const DEFAULT_NOTE_COLOR: Color = { r: 255, g: 255, b: 0 };

const DEFAULT_OPACITY = 1;

/**
 * Apply a text (sticky-note) draft. The visual is entirely generator-owned:
 * the mutator's closing `regenerateAppearance` bakes the 20×20 note icon
 * from `/C` + `/Name` (GenerateTextAP), so this writer only records state.
 * `/State` + `/StateModel` are dictionary-only (ISO 32000 §12.5.6.3) and
 * never reach the generator.
 */
export function applyTextDraft(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  draft: TextDraft,
): void {
  if (draft.state !== undefined && draft.stateModel === undefined) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      'text draft: state requires stateModel (ISO 32000 §12.5.6.3)',
    );
  }
  applyAnnotationBaseDraft(fn, mem, annotPtr, draft);
  setAnnotRect(fn, mem, annotPtr, draft.rect);
  setAnnotColor(fn, annotPtr, draft.color ?? DEFAULT_NOTE_COLOR);
  setAnnotOpacity(fn, annotPtr, draft.opacity ?? DEFAULT_OPACITY);
  setNoteIcon(fn, annotPtr, draft.icon ?? 'note');
  if (draft.stateModel !== undefined) {
    writeAnnotString(fn, mem, annotPtr, 'StateModel', stateModelToPdf(draft.stateModel));
  }
  if (draft.state !== undefined) {
    writeAnnotString(fn, mem, annotPtr, 'State', stateToPdf(draft.state));
  }
}

export function applyTextPatch(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  patch: TextPatch,
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
  if (patch.icon !== undefined) {
    setNoteIcon(fn, annotPtr, patch.icon);
  }
  // Three-state; a patch may touch one entry alone (the other may already
  // be on the annotation), so no cross-field rule here — that is draft-only.
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

function setNoteIcon(fn: PdfFunctions, annotPtr: Ptr, icon: keyof typeof NOTE_ICON_TO_CODE): void {
  if (!fn.EPDFAnnot_SetName(annotPtr, NOTE_ICON_TO_CODE[icon])) {
    throw new EngineError(EngineErrorCode.Unknown, 'EPDFAnnot_SetName returned false');
  }
}
