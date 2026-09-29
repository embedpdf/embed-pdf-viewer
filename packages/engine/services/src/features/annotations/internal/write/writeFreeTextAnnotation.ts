import {
  EngineError,
  EngineErrorCode,
  richTextParagraphsFromPlainText,
  type Color,
  type FreeTextDraft,
  type FreeTextFont,
  type FreeTextIntent,
  type FreeTextPatch,
  type PdfCoordinates,
  type RichTextAlign,
  type RichTextBody,
  type RichTextDocumentInput,
  type VerticalAlignment,
} from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { FPDFANNOT_COLORTYPE } from '../colorType';
import { freeTextIntentFromName, freeTextIntentToName } from '../freeTextIntent';
import {
  readCalloutLine,
  readDefaultAppearance,
  readIntent,
} from '../read/annotationReadPrimitives';
import { engineRichTextJson, faceForFreeTextFont, readEngineRichText } from '../richTextWire';
import { DEFAULT_STANDARD_FONT, standardFontFromCode } from '../standardFont';
import { textAlignmentToCode } from '../textAlignment';
import { VERTICAL_ALIGNMENT_KEY, verticalAlignmentToCode } from '../verticalAlignment';
import type { AnnotationWriteContext } from './annotationWriteContext';
import {
  clearAnnotColor,
  clearBorderEffect,
  setAnnotColor,
  setAnnotOpacity,
  setBorderEffect,
  setCalloutLine,
  setIntent,
  setLineEndings,
  setTextAlignment,
} from './annotationWritePrimitives';
import { applyAnnotationBaseDraft, applyAnnotationBasePatch } from './writeAnnotationBase';
import { applyAnnotationBoxPatch, writeAnnotationBox } from './writeAnnotationBox';
import { applyDefaultAppearance } from './writeDefaultAppearance';
import { applyBorderDraft, applyBorderPatch, DEFAULT_OPACITY } from './writeStyle';

/** The border's color when a create leaves `color` out. */
const DEFAULT_FREETEXT_COLOR: Color = '#000000';

const DEFAULT_FONT_SIZE = 12;

/**
 * Write rich text through the engine's rich writer: `/RC`, `/DS`, `/DA`,
 * `/Contents` and the appearance, all or nothing. Faces in the input are
 * resolved from keys / standard names to the identities the engine names.
 * The body's missing properties take the engine's defaults (Helvetica 12 pt
 * black, left-aligned).
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

/** `#RRGGBB` for a rich body colour, as Acrobat writes it. */
const hexColor = (color: Color): string => color.toUpperCase();

/** The text style a write names by itself: the rich text body's own. */
interface TextStyle {
  fontFamily?: FreeTextFont;
  fontSize?: number;
  fontColor?: Color;
  textAlign?: RichTextAlign;
}

/**
 * `base` with the text style over it. A style given by itself wins over the
 * rich text body's, so a read sent back with one of them changed changes it.
 */
function bodyWith(
  base: Partial<RichTextBody>,
  style: TextStyle,
  ctx: AnnotationWriteContext | undefined,
): Partial<RichTextBody> {
  const body = { ...base };
  if (style.fontFamily !== undefined) {
    const face = faceForFreeTextFont(style.fontFamily, ctx?.describeRegisteredFont);
    body.family = face.family;
    if (face.weight !== undefined) body.weight = face.weight;
    if (face.italic !== undefined) body.italic = face.italic;
  }
  if (style.fontSize !== undefined) body.size = style.fontSize;
  if (style.fontColor !== undefined) body.color = hexColor(style.fontColor);
  if (style.textAlign !== undefined) body.align = style.textAlign;
  return body;
}

/** A callout line goes only with the callout intent: another box would draw without it. */
function assertCalloutIntent(intent: FreeTextIntent, calloutLine: unknown): void {
  if (calloutLine != null && intent !== 'free-text-callout') {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      `free-text: a callout line needs intent 'free-text-callout', not '${intent}'`,
      { details: { field: 'intent' } },
    );
  }
}

function setVerticalAlign(fn: PdfFunctions, annotPtr: Ptr, align: VerticalAlignment): void {
  if (
    !fn.EPDFAnnot_SetEmbedMetadataNumber(
      annotPtr,
      VERTICAL_ALIGNMENT_KEY,
      verticalAlignmentToCode(align),
    )
  ) {
    throw new EngineError(
      EngineErrorCode.Unknown,
      'EPDFAnnot_SetEmbedMetadataNumber returned false',
    );
  }
}

/**
 * Apply a free-text draft to a freshly-created annotation. Colour model, as
 * Acrobat draws it:
 *   - `color` -> the `/DA` colour: the border and a callout's line.
 *   - `fontColor` -> the rich text body's colour: the text.
 *   - `interiorColor` -> `/C` box background (`null`/omitted clears it).
 *
 * The text style (`fontFamily`, `fontSize`, `fontColor`, `textAlign`) is the
 * rich text body: given by itself it wins over `richText.body`, and what
 * neither gives takes the engine's defaults. The intent follows the callout
 * line when left out.
 */
export function applyFreeTextDraft(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  draft: FreeTextDraft<PdfCoordinates>,
  ctx?: AnnotationWriteContext,
): void {
  const intent = draft.intent ?? (draft.calloutLine != null ? 'free-text-callout' : 'free-text');
  assertCalloutIntent(intent, draft.calloutLine);

  applyAnnotationBaseDraft(fn, mem, annotPtr, draft);
  writeAnnotationBox(fn, mem, annotPtr, { box: draft.box, rotation: draft.rotation ?? null });

  const background = draft.interiorColor ?? null;
  if (background === null) {
    clearAnnotColor(fn, annotPtr, FPDFANNOT_COLORTYPE.Color);
  } else {
    setAnnotColor(fn, annotPtr, background, FPDFANNOT_COLORTYPE.Color);
  }
  setAnnotOpacity(fn, annotPtr, draft.opacity ?? DEFAULT_OPACITY);

  applyBorderDraft(fn, mem, annotPtr, draft);
  if (draft.cloudyIntensity != null) setBorderEffect(fn, annotPtr, draft.cloudyIntensity);

  // The rich text writer below sets the /DA font and size from the body and
  // keeps this colour: the border's.
  applyDefaultAppearance(
    fn,
    annotPtr,
    draft.fontFamily ?? DEFAULT_STANDARD_FONT,
    draft.fontSize ?? DEFAULT_FONT_SIZE,
    draft.color ?? DEFAULT_FREETEXT_COLOR,
    ctx,
  );

  const body = bodyWith(draft.richText?.body ?? {}, draft, ctx);
  setTextAlignment(fn, annotPtr, textAlignmentToCode(body.align ?? 'left'));
  setIntent(fn, annotPtr, freeTextIntentToName(intent));
  if (draft.verticalAlign !== undefined && draft.verticalAlign !== 'top') {
    setVerticalAlign(fn, annotPtr, draft.verticalAlign);
  }

  if (draft.calloutLine != null) {
    setCalloutLine(fn, mem, annotPtr, draft.calloutLine);
  }
  if (draft.lineEnding != null) {
    setLineEndings(fn, annotPtr, { start: 'none', end: draft.lineEnding });
  }

  // Rich text last, always: a box is born with all four forms (/RC, /DS,
  // /DA, /Contents) and its appearance, Acrobat's shape — from the draft's
  // rich document, else from its plain contents as body-style paragraphs.
  // Must come after the geometry, which the layout needs.
  writeRichText(
    fn,
    annotPtr,
    {
      body,
      paragraphs:
        draft.richText?.paragraphs ?? richTextParagraphsFromPlainText(draft.contents ?? ''),
    },
    ctx,
  );
}

/**
 * Apply a free-text patch to an existing annotation. Only present fields are
 * touched. `color` rewrites the `/DA` colour (the border), keeping its font
 * and size; the text style is the rich text body, so a change to it, to the
 * rich text or to the contents rewrites the rich text over the current body.
 * A partial `richText.body` merges over the current style.
 */
export function applyFreeTextPatch(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  patch: FreeTextPatch<PdfCoordinates>,
  ctx?: AnnotationWriteContext,
): void {
  // Checked before anything is written.
  if (patch.intent !== undefined || patch.calloutLine !== undefined) {
    const intent = patch.intent ?? freeTextIntentFromName(readIntent(fn, mem, annotPtr));
    const current = readCalloutLine(fn, mem, annotPtr);
    const calloutLine =
      patch.calloutLine !== undefined ? patch.calloutLine : current.length >= 2 ? current : null;
    assertCalloutIntent(intent, calloutLine);
  }

  applyAnnotationBasePatch(fn, mem, annotPtr, patch);

  applyAnnotationBoxPatch(fn, mem, annotPtr, patch);

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
  if (patch.cloudyIntensity !== undefined) {
    if (patch.cloudyIntensity === null) clearBorderEffect(fn, annotPtr);
    else setBorderEffect(fn, annotPtr, patch.cloudyIntensity);
  }

  if (patch.color !== undefined) {
    const cur = readDefaultAppearance(fn, mem, annotPtr);
    applyDefaultAppearance(
      fn,
      annotPtr,
      cur ? standardFontFromCode(cur.fontCode) : DEFAULT_STANDARD_FONT,
      cur && cur.fontSize > 0 ? cur.fontSize : DEFAULT_FONT_SIZE,
      patch.color,
      ctx,
    );
  }

  const style: TextStyle = {
    fontFamily: patch.fontFamily,
    fontSize: patch.fontSize,
    fontColor: patch.fontColor,
    textAlign: patch.textAlign,
  };
  const restyled = Object.values(style).some((value) => value !== undefined);
  if (patch.richText !== undefined || patch.contents !== undefined || restyled) {
    const current = readEngineRichText(fn, mem, annotPtr);
    const body = bodyWith({ ...current?.body, ...patch.richText?.body }, style, ctx);
    // Plain contents become body-style paragraphs, one per line break: run
    // formatting is lost by design, since a plain-text client can't see it.
    // (`contents` given with `richText` was checked against its projection.)
    const paragraphs =
      patch.richText?.paragraphs ??
      (patch.contents !== undefined
        ? richTextParagraphsFromPlainText(patch.contents ?? '')
        : (current?.paragraphs ?? richTextParagraphsFromPlainText('')));
    writeRichText(fn, annotPtr, { body, paragraphs }, ctx);
    // The body's alignment is what the appearance paints; /Q follows it.
    if (body.align !== undefined) setTextAlignment(fn, annotPtr, textAlignmentToCode(body.align));
  }

  if (patch.intent !== undefined) {
    setIntent(fn, annotPtr, freeTextIntentToName(patch.intent));
  }
  if (patch.verticalAlign !== undefined) {
    setVerticalAlign(fn, annotPtr, patch.verticalAlign);
  }

  if (patch.calloutLine === null) {
    fn.EPDFAnnot_RemoveKey(annotPtr, 'CL');
  } else if (patch.calloutLine !== undefined) {
    setCalloutLine(fn, mem, annotPtr, patch.calloutLine);
  }
  if (patch.lineEnding === null) {
    fn.EPDFAnnot_RemoveKey(annotPtr, 'LE');
  } else if (patch.lineEnding !== undefined) {
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
