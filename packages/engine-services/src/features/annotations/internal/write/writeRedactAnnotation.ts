import type { Color, RedactDraft, RedactPatch } from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/pdf-runtime';

import { FPDFANNOT_COLORTYPE } from '../colorType';
import { DEFAULT_STANDARD_FONT } from '../standardFont';
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
import { DEFAULT_OPACITY } from './writeStyle';
import {
  appendQuadPoints,
  replaceQuadPoints,
  setRectFromQuadPoints,
} from './writeTextMarkupAnnotation';

/** Default `/C` marking outline: red — the redaction marking convention (and
 *  the AP generator's default). */
const DEFAULT_REDACT_COLOR: Color = { r: 255, g: 0, b: 0 };

/** Default `/DA` label colour: black, mirroring free text. Tools that pair a
 *  label with a dark `interiorColor` should set a light `fontColor`
 *  explicitly. */
const DEFAULT_LABEL_COLOR: Color = { r: 0, g: 0, b: 0 };

const DEFAULT_FONT_SIZE = 12;

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

/**
 * Apply a redact draft to a freshly-created annotation. Colour model:
 *   - `color` -> `/C` marking-stage outline.
 *   - `interiorColor` -> `/IC` post-apply fill (`null`/omitted = the key is
 *     never written; ISO leaves the region transparent).
 *   - `fontColor` -> the `/DA` colour (label text).
 *
 * Order:
 *   1. base author-metadata (contents/nm/flags)
 *   2. `/Rect` (required — supplied by the caller; never derived)
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
  draft: RedactDraft,
  ctx?: AnnotationWriteContext,
): void {
  applyAnnotationBaseDraft(fn, mem, annotPtr, draft);
  setAnnotRect(fn, mem, annotPtr, draft.rect);
  if (draft.quadPoints && draft.quadPoints.length > 0) {
    appendQuadPoints(fn, mem, annotPtr, draft.quadPoints);
  }

  setAnnotColor(fn, annotPtr, draft.color ?? DEFAULT_REDACT_COLOR, FPDFANNOT_COLORTYPE.Color);
  setAnnotOpacity(fn, annotPtr, draft.opacity ?? DEFAULT_OPACITY);
  const fill = draft.interiorColor ?? null;
  if (fill !== null) {
    setAnnotColor(fn, annotPtr, fill, FPDFANNOT_COLORTYPE.InteriorColor);
  }

  if (draft.overlayText !== undefined && draft.overlayText.length > 0) {
    setOverlayText(fn, mem, annotPtr, draft.overlayText);
  }
  if (draft.repeat) {
    setOverlayTextRepeat(fn, annotPtr, true);
  }
  if (touchesLabelStyle(draft)) {
    applyDefaultAppearance(
      fn,
      annotPtr,
      draft.fontFamily ?? DEFAULT_STANDARD_FONT,
      draft.fontSize ?? DEFAULT_FONT_SIZE,
      draft.fontColor ?? DEFAULT_LABEL_COLOR,
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
 * shares the text-markup no-shrink constraint (PDFium can grow but not
 * shrink the attachment-points list); patching quads re-derives `/Rect` from
 * their bounds unless the patch also carries an explicit `rect`.
 */
export function applyRedactPatch(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  patch: RedactPatch,
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
    applyDefaultAppearance(
      fn,
      annotPtr,
      patch.fontFamily ?? DEFAULT_STANDARD_FONT,
      patch.fontSize ?? DEFAULT_FONT_SIZE,
      patch.fontColor ?? DEFAULT_LABEL_COLOR,
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
