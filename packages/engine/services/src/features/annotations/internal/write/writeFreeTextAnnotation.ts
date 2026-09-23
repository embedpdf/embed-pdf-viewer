import {
  EngineError,
  EngineErrorCode,
  richTextParagraphsFromPlainText,
  type Color,
  type FreeTextDraft,
  type FreeTextPatch,
  type RichTextDocumentInput,
} from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { FPDFANNOT_COLORTYPE } from '../colorType';
import { freeTextIntentToName } from '../freeTextIntent';
import { readDefaultAppearance } from '../read/annotationReadPrimitives';
import { engineRichTextJson, faceForFreeTextFont, readEngineRichText } from '../richTextWire';
import { DEFAULT_STANDARD_FONT, standardFontFromCode } from '../standardFont';
import { textAlignmentToCode } from '../textAlignment';
import type { AnnotationWriteContext } from './annotationWriteContext';
import {
  clearAnnotColor,
  clearRectangleDifferences,
  setAnnotColor,
  setAnnotOpacity,
  setAnnotRect,
  setCalloutLine,
  setIntent,
  setLineEndings,
  setRectangleDifferences,
  setTextAlignment,
} from './annotationWritePrimitives';
import { applyAnnotationBaseDraft, applyAnnotationBasePatch } from './writeAnnotationBase';
import { applyDefaultAppearance } from './writeDefaultAppearance';
import { applyBorderDraft, applyBorderPatch, DEFAULT_OPACITY } from './writeStyle';
import { writeBoxTransformMetadata } from './writeAnnotationTransformMetadata';

/**
 * Default `/DA` colour for free text: black (border + default text). Unlike
 * the geometric families (which default to red `/C`), a text box reads best
 * with a black mark.
 */
const DEFAULT_FREETEXT_COLOR: Color = { r: 0, g: 0, b: 0 };

/**
 * Write rich text through the engine's rich writer: `/RC`, `/DS`, `/DA`,
 * `/Contents` and the appearance, all or nothing. Faces in the input are
 * resolved from keys / standard names to the identities the engine names.
 */
function writeRichText(
  fn: PdfFunctions,
  annotPtr: Ptr,
  input: RichTextDocumentInput,
  ctx: AnnotationWriteContext | undefined,
): void {
  const json = engineRichTextJson(input, ctx?.describeRegisteredFont);
  if (!fn.EPDFAnnot_SetRichTextJSON(annotPtr, json)) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      'rich text could not be written (empty rect, or a font resource could not be built)',
    );
  }
}

/** `#RRGGBB` for a rich body colour. */
function hexColor(color: Color): string {
  const hex = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0');
  return `#${hex(color.r)}${hex(color.g)}${hex(color.b)}`.toUpperCase();
}

/**
 * Apply a free-text draft to a freshly-created annotation. Colour model:
 *   - `color` -> `/DA` colour = border + default text colour.
 *   - `fontColor` (optional) -> `TextColor` channel, overriding text only;
 *     written after `/DA` so the override wins.
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

  if (draft.rectDifferences != null) {
    setRectangleDifferences(fn, annotPtr, draft.rectDifferences);
  }

  if (draft.calloutLine !== undefined) {
    setCalloutLine(fn, mem, annotPtr, draft.calloutLine);
  }
  if (draft.lineEnding !== undefined) {
    setLineEndings(fn, annotPtr, { start: 'none', end: draft.lineEnding });
  }
  // A plain text box rotates like square/circle (box model). A callout's
  // rotation applies to its text box only (`unrotatedRect` = the logical text
  // box; the /CL leader stays page-space) — the AP generator bakes it as an
  // inline matrix, not the form /Matrix. Absent fields simply clear the keys.
  writeBoxTransformMetadata(fn, mem, annotPtr, {
    rotation: draft.rotation,
    unrotatedRect: draft.unrotatedRect,
  });

  // Rich text last, always: a box is born with all four forms (/RC, /DS,
  // /DA, /Contents) and its appearance, Acrobat's shape — from the draft's
  // rich document, else from its plain contents as body-style paragraphs.
  // The body becomes the body style (the /DA font and size follow it; the
  // /DA colour written above is kept). Must come after the geometry, which
  // the layout needs.
  writeRichText(
    fn,
    annotPtr,
    draft.richText ?? { paragraphs: richTextParagraphsFromPlainText(draft.contents ?? '') },
    ctx,
  );
}

/**
 * Apply a free-text patch to an existing annotation. Only present fields are
 * touched. `/DA` packs the font, size, and `color` into one string, so a
 * partial patch preserves the unpatched members by reading the current triple
 * first (the same read-modify-write as {@link applyBorderPatch}'s shared
 * `/BS` call) — a `{fontSize}` patch must never reset the font or colour.
 * Registered (embedded) fonts are the one caveat: the current `/DA` reads
 * back as a font code, so preserving a registered family requires the patch
 * to restate `fontFamily` (an unknown code falls back to the standard-font
 * default).
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
  }
  // Transform metadata is tri-state per field (undefined preserves, null
  // clears, value sets) — independent of whether /Rect was rewritten. A
  // rect-only patch on a rotated box keeps its rotation.
  writeBoxTransformMetadata(fn, mem, annotPtr, {
    rotation: patch.rotation,
    unrotatedRect: patch.unrotatedRect,
  });

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

  // Every text write goes through the rich document — the body style lives
  // there and the engine derives /DA from it — so the /DA read-modify-write
  // only carries the DA colour (the border and leader), and the font, size,
  // text colour and alignment are body-style changes.
  const current = readEngineRichText(fn, mem, annotPtr);
  if (patch.color !== undefined) {
    const cur = readDefaultAppearance(fn, mem, annotPtr);
    applyDefaultAppearance(
      fn,
      annotPtr,
      cur ? standardFontFromCode(cur.fontCode) : DEFAULT_STANDARD_FONT,
      cur && cur.fontSize > 0 ? cur.fontSize : 12,
      patch.color,
      ctx,
    );
  }
  if (patch.fontColor !== undefined) {
    setAnnotColor(fn, annotPtr, patch.fontColor, FPDFANNOT_COLORTYPE.TextColor);
  }
  {
    if (patch.richText !== undefined) {
      // Rich replacement: everything regenerated. (`contents`, if also
      // given, was checked against its projection before the write.)
      writeRichText(fn, annotPtr, patch.richText, ctx);
    } else if (patch.contents !== undefined) {
      // Plain-text replacement: body-style paragraphs, one per line break.
      // Run formatting is lost by design — a plain-text client cannot
      // preserve what it cannot see.
      writeRichText(
        fn,
        annotPtr,
        { paragraphs: richTextParagraphsFromPlainText(patch.contents ?? '') },
        ctx,
      );
    } else if (
      current &&
      (patch.fontFamily !== undefined ||
        patch.fontSize !== undefined ||
        patch.fontColor !== undefined ||
        patch.textAlign !== undefined)
    ) {
      // Default-style change: the body moves; runs are deltas, so every run
      // that did not override the property follows. Alignment is a body
      // property too: the /RC body's text-align wins over /Q on
      // regeneration, so /Q alone (set below) would not move a rich box.
      const body = { ...current.body };
      if (patch.fontFamily !== undefined) {
        const face = faceForFreeTextFont(patch.fontFamily, ctx?.describeRegisteredFont);
        body.family = face.family;
        if (face.weight !== undefined) body.weight = face.weight;
        if (face.italic !== undefined) body.italic = face.italic;
      }
      if (patch.fontSize !== undefined) body.size = patch.fontSize;
      if (patch.fontColor !== undefined) body.color = hexColor(patch.fontColor);
      if (patch.textAlign !== undefined) body.align = patch.textAlign;
      writeRichText(fn, annotPtr, { body, paragraphs: current.paragraphs }, ctx);
    }
  }

  if (patch.textAlign !== undefined) {
    setTextAlignment(fn, annotPtr, textAlignmentToCode(patch.textAlign));
  }
  if (patch.intent !== undefined) {
    setIntent(fn, annotPtr, freeTextIntentToName(patch.intent));
  }

  if (patch.rectDifferences === null) {
    clearRectangleDifferences(fn, annotPtr);
  } else if (patch.rectDifferences !== undefined) {
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
