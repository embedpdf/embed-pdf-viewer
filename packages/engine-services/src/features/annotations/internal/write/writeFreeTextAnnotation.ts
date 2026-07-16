import {
  EngineError,
  EngineErrorCode,
  type Color,
  type FreeTextDraft,
  type FreeTextFont,
  type FreeTextPatch,
} from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/pdf-runtime';

import { FPDFANNOT_COLORTYPE } from '../colorType';
import { freeTextIntentToName } from '../freeTextIntent';
import { isStandardFont, standardFontToCode } from '../standardFont';
import { textAlignmentToCode } from '../textAlignment';
import type { AnnotationWriteContext } from './annotationWriteContext';
import {
  clearAnnotColor,
  setAnnotColor,
  setAnnotOpacity,
  setAnnotRect,
  setCalloutLine,
  setDefaultAppearance,
  setDefaultAppearanceRegisteredFont,
  setIntent,
  setLineEndings,
  setRectangleDifferences,
  setTextAlignment,
} from './annotationWritePrimitives';
import { applyAnnotationBaseDraft, applyAnnotationBasePatch } from './writeAnnotationBase';
import { applyBorderDraft, applyBorderPatch, DEFAULT_OPACITY } from './writeStyle';
import { writeBoxTransformMetadata } from './writeAnnotationTransformMetadata';

/**
 * Default `/DA` colour for free text: black (border + default text). Unlike
 * the geometric families (which default to red `/C`), a text box reads best
 * with a black mark.
 */
const DEFAULT_FREETEXT_COLOR: Color = { r: 0, g: 0, b: 0 };

/**
 * Write `/DA`. A standard font name goes through the native standard-font path;
 * anything else is treated as a registered-font `key` and resolved to this
 * thread's FontId. A key with no resolver wired (e.g. a host without a font
 * registry) is a programming error — fail loud rather than silently downgrade
 * to Helvetica and embed the wrong glyphs.
 */
function applyDefaultAppearance(
  fn: PdfFunctions,
  annotPtr: Ptr,
  fontFamily: FreeTextFont,
  fontSize: number,
  color: Color,
  ctx: AnnotationWriteContext | undefined,
): void {
  if (isStandardFont(fontFamily)) {
    setDefaultAppearance(fn, annotPtr, standardFontToCode(fontFamily), fontSize, color);
    return;
  }
  if (!ctx?.resolveRegisteredFontId) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      `fontFamily '${fontFamily}' is not a standard font and no font registry is available on this host`,
    );
  }
  setDefaultAppearanceRegisteredFont(
    fn,
    annotPtr,
    ctx.resolveRegisteredFontId(fontFamily),
    fontSize,
    color,
  );
}

/**
 * Apply a free-text draft to a freshly-created annotation. Colour model:
 *   - `color` -> `/DA` colour = border + default text colour.
 *   - `fontColor` (optional) -> `TextColor` channel, overriding text only;
 *     written AFTER `/DA` so the override wins.
 *   - `interiorColor` -> `/C` box background (`null`/omitted clears it).
 *
 * Order:
 *   1. base author-metadata (contents/nm/flags)
 *   2. `/Rect` (required — supplied by the caller; never derived)
 *   3. `/C` background (set or clear) + `/CA` opacity
 *   4. `/BS` border (style + width + dash)
 *   5. `/DA` default appearance (font + size + `color`)
 *   6. `TextColor` override (only when `fontColor` is given)
 *   7. `/Q` text alignment
 *   8. `/IT` intent
 *   9. `/RD` rectangle differences (optional)
 *  10. callout `/CL` + leader `/LE` ending (only for callouts with geometry)
 */
export function applyFreeTextDraft(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  draft: FreeTextDraft,
  ctx?: AnnotationWriteContext,
): void {
  applyAnnotationBaseDraft(fn, mem, annotPtr, draft);
  setAnnotRect(fn, mem, annotPtr, draft.rect);

  const background = draft.interiorColor ?? null;
  if (background === null) {
    clearAnnotColor(fn, annotPtr, FPDFANNOT_COLORTYPE.Color);
  } else {
    setAnnotColor(fn, annotPtr, background, FPDFANNOT_COLORTYPE.Color);
  }
  setAnnotOpacity(fn, annotPtr, draft.opacity ?? DEFAULT_OPACITY);

  applyBorderDraft(fn, mem, annotPtr, draft);

  const daColor = draft.color ?? DEFAULT_FREETEXT_COLOR;
  applyDefaultAppearance(fn, annotPtr, draft.fontFamily, draft.fontSize, daColor, ctx);
  if (draft.fontColor !== undefined) {
    setAnnotColor(fn, annotPtr, draft.fontColor, FPDFANNOT_COLORTYPE.TextColor);
  }

  setTextAlignment(fn, annotPtr, textAlignmentToCode(draft.textAlign));
  setIntent(fn, annotPtr, freeTextIntentToName(draft.intent));

  if (draft.rectDifferences !== undefined) {
    setRectangleDifferences(fn, annotPtr, draft.rectDifferences);
  }

  if (draft.calloutLine !== undefined) {
    setCalloutLine(fn, mem, annotPtr, draft.calloutLine);
  }
  if (draft.lineEnding !== undefined) {
    setLineEndings(fn, annotPtr, { start: 'none', end: draft.lineEnding });
  }
  // A plain text box rotates like square/circle (box model). A callout's
  // rotation applies to its text BOX only (`unrotatedRect` = the logical text
  // box; the /CL leader stays page-space) — the AP generator bakes it as an
  // inline matrix, not the form /Matrix. Absent fields simply clear the keys.
  writeBoxTransformMetadata(fn, mem, annotPtr, {
    rotation: draft.rotation,
    unrotatedRect: draft.unrotatedRect,
  });
}

/**
 * Apply a free-text patch to an existing annotation. Only present fields are
 * touched. Because `/DA` packs the font, size, and `color` into one string,
 * any of those three being patched re-reads the others isn't supported by
 * the binding, so we require the caller to send the full `/DA` triple
 * (`fontFamily` + `fontSize` + `color`) together when changing any of them;
 * partial `/DA` patches fall back to the values already on the patch.
 *
 * `fontColor` here only sets an override; clearing it back to "follow
 * `color`" is out of scope this iteration.
 */
export function applyFreeTextPatch(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  patch: FreeTextPatch,
  ctx?: AnnotationWriteContext,
): void {
  applyAnnotationBasePatch(fn, mem, annotPtr, patch);

  if (patch.rect !== undefined) {
    setAnnotRect(fn, mem, annotPtr, patch.rect);
    writeBoxTransformMetadata(fn, mem, annotPtr, {
      rotation: patch.rotation,
      unrotatedRect: patch.unrotatedRect,
    });
  }

  if (patch.interiorColor !== undefined) {
    if (patch.interiorColor === null) {
      clearAnnotColor(fn, annotPtr, FPDFANNOT_COLORTYPE.Color);
    } else {
      setAnnotColor(fn, annotPtr, patch.interiorColor, FPDFANNOT_COLORTYPE.Color);
    }
  }
  if (patch.opacity !== undefined) {
    setAnnotOpacity(fn, annotPtr, patch.opacity);
  }

  applyBorderPatch(fn, mem, annotPtr, patch);

  if (patch.fontFamily !== undefined || patch.fontSize !== undefined || patch.color !== undefined) {
    applyDefaultAppearance(
      fn,
      annotPtr,
      patch.fontFamily ?? 'helvetica',
      patch.fontSize ?? 12,
      patch.color ?? DEFAULT_FREETEXT_COLOR,
      ctx,
    );
  }
  if (patch.fontColor !== undefined) {
    setAnnotColor(fn, annotPtr, patch.fontColor, FPDFANNOT_COLORTYPE.TextColor);
  }

  if (patch.textAlign !== undefined) {
    setTextAlignment(fn, annotPtr, textAlignmentToCode(patch.textAlign));
  }
  if (patch.intent !== undefined) {
    setIntent(fn, annotPtr, freeTextIntentToName(patch.intent));
  }

  if (patch.rectDifferences !== undefined) {
    setRectangleDifferences(fn, annotPtr, patch.rectDifferences);
  }

  if (patch.calloutLine !== undefined) {
    setCalloutLine(fn, mem, annotPtr, patch.calloutLine);
  }
  if (patch.lineEnding !== undefined) {
    setLineEndings(fn, annotPtr, { start: 'none', end: patch.lineEnding });
  }
}

/**
 * Type-narrowing predicate used by the writer registry to pick the
 * free-text writer for a draft/patch's `subtype`.
 */
export function isFreeTextSubtype(subtype: string): subtype is 'free-text' {
  return subtype === 'free-text';
}
