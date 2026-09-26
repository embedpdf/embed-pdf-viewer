import type {
  AnnotationDTO,
  AnnotationPatch,
  Color,
  TextDraft,
  TextPatch,
} from '@embedpdf/engine-core/runtime';
import { EngineError, EngineErrorCode, standardStateModelOf } from '@embedpdf/engine-core/runtime';
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

/** Default `/C` — the generator's yellow note fill, set explicitly so reads round-trip. */
const DEFAULT_NOTE_COLOR: Color = { r: 255, g: 255, b: 0 };

const DEFAULT_OPACITY = 1;

/**
 * A review state needs its model (ISO 32000 §12.5.6.3): a standard state
 * brings its own, so only a custom state with none is refused.
 */
function stateNeedsModel(state: string): EngineError {
  return new EngineError(
    EngineErrorCode.InvalidArg,
    `text: the custom state '${state}' needs a stateModel`,
    { details: { field: 'stateModel' } },
  );
}

/** Refuse a draft whose custom state has no model, before the first write. */
export function preflightTextDraft(draft: TextDraft): void {
  if (draft.state != null && draft.stateModel == null && !standardStateModelOf(draft.state)) {
    throw stateNeedsModel(draft.state);
  }
}

/**
 * The patch with a new state's model filled in: a standard state sets its
 * own; a custom one keeps the annotation's, and needs one.
 */
export function prepareTextStatePatch(
  current: AnnotationDTO,
  patch: AnnotationPatch,
): AnnotationPatch {
  if (current.subtype !== 'text' || patch.subtype !== 'text') return patch;
  if (patch.state == null || patch.stateModel !== undefined) return patch;
  const model = standardStateModelOf(patch.state);
  if (model) return { ...patch, stateModel: model };
  if (!current.stateModel) throw stateNeedsModel(patch.state);
  return patch;
}

/**
 * Apply a text (sticky-note) draft. The visual is entirely generator-owned:
 * the closing appearance pass (`generateAppearance`) bakes the 20×20 note
 * icon from `/C` + `/Name` (GenerateTextAP), so this writer only records
 * state.
 * `/State` + `/StateModel` are dictionary-only (ISO 32000 §12.5.6.3) and
 * never reach the generator.
 */
export function applyTextDraft(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  draft: TextDraft,
): void {
  applyAnnotationBaseDraft(fn, mem, annotPtr, draft);
  setAnnotRect(fn, mem, annotPtr, draft.rect);
  setAnnotColor(fn, annotPtr, draft.color ?? DEFAULT_NOTE_COLOR);
  setAnnotOpacity(fn, annotPtr, draft.opacity ?? DEFAULT_OPACITY);
  setNoteIcon(fn, annotPtr, draft.icon ?? 'note');
  // `preflightTextDraft` refused a custom state without a model.
  const stateModel =
    draft.stateModel ?? (draft.state != null ? standardStateModelOf(draft.state) : null);
  if (stateModel != null) {
    writeAnnotString(fn, mem, annotPtr, 'StateModel', stateModelToPdf(stateModel));
  }
  if (draft.state != null) {
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
  // Three-state; `prepareTextStatePatch` filled in a new state's model.
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
