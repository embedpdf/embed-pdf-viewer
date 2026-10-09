import {
  ANNOTATION_DEFAULTS,
  EngineError,
  EngineErrorCode,
  type Color,
  type RedactDraft,
  type RedactPatch,
  type PdfCoordinates,
} from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { FPDFANNOT_COLORTYPE } from '../colorType';
import { readDefaultAppearance } from '../read/annotationReadPrimitives';
import { standardFontFromCode } from '../standardFont';
import { textAlignmentToCode } from '../textAlignment';
import type { AnnotationWriteContext } from './annotationWriteContext';
import {
  clearAnnotColor,
  setAnnotColor,
  setAnnotOpacity,
  setAnnotRect,
  setOverlayText,
  setOverlayTextRepeat,
  setTextAlignment,
} from './annotationWritePrimitives';
import { applyAnnotationBaseDraft, applyAnnotationBasePatch } from './writeAnnotationBase';
import { applyDefaultAppearance } from './writeDefaultAppearance';
import {
  appendQuadPoints,
  replaceQuadPoints,
  setRectFromQuadPoints,
} from './writeTextMarkupAnnotation';

/** A redaction's defaults (`annotation/defaults.ts`): a red outline, a black 12 pt label. */
const DEFAULTS = ANNOTATION_DEFAULTS.redact;

/**
 * True when the draft/patch carries the label or any `/DA` member — i.e. the
 * `/DA` must be (re)written. ISO 32000-2 requires a `/DA` alongside
 * `/OverlayText`, so setting a label always emits one (defaults filling any
 * omitted triple member). Clearing the label (`overlayText: null`) does not.
 */
function touchesLabelStyle(p: {
  overlayText?: string | null;
  fontFamily?: unknown;
  fontSize?: number;
  fontColor?: Color;
}): boolean {
  return (
    (p.overlayText !== undefined && p.overlayText !== null) ||
    p.fontFamily !== undefined ||
    p.fontSize !== undefined ||
    p.fontColor !== undefined
  );
}

/** A redaction marks an area: a create gives its `rect`, or quads it is worked out from. */
export function preflightRedactDraft(draft: RedactDraft<PdfCoordinates>): void {
  if (draft.rect === undefined && (draft.quadPoints ?? []).length === 0) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      'redact create needs a rect or at least one of quadPoints',
      { details: { field: 'rect' } },
    );
  }
}

/**
 * Apply a redact draft to a freshly-created annotation. Colour model:
 *   - `color` -> `/C` marking-stage outline.
 *   - `interiorColor` -> `/IC` post-apply fill (`null`/omitted = the key is
 *     never written; ISO leaves the region transparent).
 *   - `fontColor` -> the `/DA` colour (label text).
 *
 * Order:
 *   1. base author-metadata (contents/nm/flags)
 *   2. `/Rect` (the caller's, else the quads' bounds)
 *   3. `/QuadPoints` (text redactions only)
 *   4. `/C` outline + `/CA` opacity + `/IC` fill
 *   5. `/OverlayText` + `/Repeat`
 *   6. `/DA` (only when a label field is present)
 *   7. `/Q` label alignment
 */
export function applyRedactDraft(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  draft: RedactDraft<PdfCoordinates>,
  ctx?: AnnotationWriteContext,
): void {
  applyAnnotationBaseDraft(fn, mem, annotPtr, draft);
  const quads = draft.quadPoints ?? [];
  if (quads.length > 0) appendQuadPoints(fn, mem, annotPtr, quads);
  // `preflightRedactDraft` refused a draft with neither.
  if (draft.rect) setAnnotRect(fn, mem, annotPtr, draft.rect);
  else setRectFromQuadPoints(fn, mem, annotPtr, quads);

  setAnnotColor(fn, annotPtr, draft.color ?? DEFAULTS.color, FPDFANNOT_COLORTYPE.Color);
  setAnnotOpacity(fn, annotPtr, draft.opacity ?? DEFAULTS.opacity);
  const fill = draft.interiorColor ?? null;
  if (fill !== null) {
    setAnnotColor(fn, annotPtr, fill, FPDFANNOT_COLORTYPE.InteriorColor);
  }

  if (draft.overlayText != null && draft.overlayText.length > 0) {
    setOverlayText(fn, mem, annotPtr, draft.overlayText);
  }
  if (draft.repeat) {
    setOverlayTextRepeat(fn, annotPtr, true);
  }
  if (touchesLabelStyle(draft)) {
    applyDefaultAppearance(
      fn,
      annotPtr,
      draft.fontFamily ?? DEFAULTS.fontFamily,
      draft.fontSize ?? DEFAULTS.fontSize,
      draft.fontColor ?? DEFAULTS.fontColor,
      ctx,
    );
  }
  if (draft.textAlign !== undefined) {
    setTextAlignment(fn, annotPtr, textAlignmentToCode(draft.textAlign));
  }
}

/**
 * Apply a redact patch to an existing annotation. Only present fields are
 * touched. `/DA` follows the free-text triple rule: send `fontFamily` +
 * `fontSize` + `fontColor` together when changing any of them. `quadPoints`
 * replace the list whole; patching quads re-derives `/Rect` from their
 * bounds unless the patch also carries an explicit `rect`.
 */
export function applyRedactPatch(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  patch: RedactPatch<PdfCoordinates>,
  ctx?: AnnotationWriteContext,
): void {
  applyAnnotationBasePatch(fn, mem, annotPtr, patch);

  if (patch.rect !== undefined) {
    setAnnotRect(fn, mem, annotPtr, patch.rect);
  }
  if (patch.quadPoints !== undefined) {
    replaceQuadPoints(fn, mem, annotPtr, patch.quadPoints);
    if (patch.rect === undefined) {
      setRectFromQuadPoints(fn, mem, annotPtr, patch.quadPoints);
    }
  }

  if (patch.color !== undefined) {
    setAnnotColor(fn, annotPtr, patch.color, FPDFANNOT_COLORTYPE.Color);
  }
  if (patch.opacity !== undefined) {
    setAnnotOpacity(fn, annotPtr, patch.opacity);
  }
  if (patch.interiorColor !== undefined) {
    if (patch.interiorColor === null) {
      clearAnnotColor(fn, annotPtr, FPDFANNOT_COLORTYPE.InteriorColor);
    } else {
      setAnnotColor(fn, annotPtr, patch.interiorColor, FPDFANNOT_COLORTYPE.InteriorColor);
    }
  }

  if (patch.overlayText !== undefined) {
    // The native setter removes the key for an empty string, so `null`
    // (clear the label) maps to ''.
    setOverlayText(fn, mem, annotPtr, patch.overlayText ?? '');
  }
  if (patch.repeat !== undefined) {
    setOverlayTextRepeat(fn, annotPtr, patch.repeat);
  }
  if (touchesLabelStyle(patch)) {
    // `/DA` packs the label's font, size and color into one string: a patch
    // that names some keeps the others as they are (a size of 0 fits the
    // label to the region, so it is kept too).
    const current = readDefaultAppearance(fn, mem, annotPtr);
    applyDefaultAppearance(
      fn,
      annotPtr,
      patch.fontFamily ?? (current ? standardFontFromCode(current.fontCode) : DEFAULTS.fontFamily),
      patch.fontSize ?? current?.fontSize ?? DEFAULTS.fontSize,
      patch.fontColor ?? current?.color ?? DEFAULTS.fontColor,
      ctx,
    );
  }
  if (patch.textAlign !== undefined) {
    setTextAlignment(fn, annotPtr, textAlignmentToCode(patch.textAlign));
  }
}

/**
 * Type-narrowing predicate used by the writer registry to pick the redact
 * writer for a draft/patch's `subtype`.
 */
export function isRedactSubtype(subtype: string): subtype is 'redact' {
  return subtype === 'redact';
}
