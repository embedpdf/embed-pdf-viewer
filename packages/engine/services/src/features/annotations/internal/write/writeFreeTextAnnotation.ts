import {
  ANNOTATION_DEFAULTS,
  EngineError,
  EngineErrorCode,
  type FreeTextDraft,
  type FreeTextPatch,
  type RichTextDocumentInput,
  type PdfCoordinates,
  type VerticalAlignment,
  type PlacedDraft,
} from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { FPDFANNOT_COLORTYPE } from '../colorType';
import { freeTextIntentToName } from '../freeTextIntent';
import { readDefaultAppearance } from '../read/annotationReadPrimitives';
import { engineRichTextJson } from '../richTextWire';
import { standardFontFromCode } from '../standardFont';
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
import { applyBorderDraft, applyBorderPatch } from './writeStyle';

/** A free text's defaults (`annotation/defaults.ts`): a black border and text, Helvetica 12 pt. */
const DEFAULTS = ANNOTATION_DEFAULTS['free-text'];

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
 * Apply a resolved free-text draft (`pdfResolveAnnotationDraft`) to a
 * freshly-created annotation. The draft states its intent, and its text as
 * rich text whose body carries the text style. Colour model, as Acrobat
 * draws it:
 *   - `color` -> the `/DA` colour: the border and a callout's line.
 *   - `fontColor` -> the rich text body's colour: the text.
 *   - `interiorColor` -> `/C` box background (`null`/omitted clears it).
 */
export function applyFreeTextDraft(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  draft: PlacedDraft<FreeTextDraft<PdfCoordinates>>,
  ctx?: AnnotationWriteContext,
): void {
  applyAnnotationBaseDraft(fn, mem, annotPtr, draft);
  writeAnnotationBox(fn, mem, annotPtr, { box: draft.box, rotation: draft.rotation ?? null });

  const background = draft.interiorColor ?? null;
  if (background === null) {
    clearAnnotColor(fn, annotPtr, FPDFANNOT_COLORTYPE.Color);
  } else {
    setAnnotColor(fn, annotPtr, background, FPDFANNOT_COLORTYPE.Color);
  }
  setAnnotOpacity(fn, annotPtr, draft.opacity ?? DEFAULTS.opacity);

  applyBorderDraft(fn, mem, annotPtr, draft);
  if (draft.cloudyIntensity != null) setBorderEffect(fn, annotPtr, draft.cloudyIntensity);

  // The rich text writer below sets the /DA font and size from the body and
  // keeps this colour: the border's.
  applyDefaultAppearance(
    fn,
    annotPtr,
    draft.fontFamily ?? DEFAULTS.fontFamily,
    draft.fontSize ?? DEFAULTS.fontSize,
    draft.color ?? DEFAULTS.color,
    ctx,
  );

  const richText = draft.richText!;
  setTextAlignment(fn, annotPtr, textAlignmentToCode(richText.body?.align ?? DEFAULTS.textAlign));
  setIntent(fn, annotPtr, freeTextIntentToName(draft.intent ?? DEFAULTS.intent));
  if (draft.verticalAlign !== undefined && draft.verticalAlign !== DEFAULTS.verticalAlign) {
    setVerticalAlign(fn, annotPtr, draft.verticalAlign);
  }

  if (draft.calloutLine != null) {
    setCalloutLine(fn, mem, annotPtr, draft.calloutLine);
  }
  if (draft.lineEnding != null) {
    setLineEndings(fn, annotPtr, { start: 'none', end: draft.lineEnding });
  }

  // Rich text last, always: a box is born with all four forms (/RC, /DS,
  // /DA, /Contents) and its appearance, Acrobat's shape. Must come after the
  // geometry, which the layout needs.
  writeRichText(fn, annotPtr, richText, ctx);
}

/**
 * Apply a resolved free-text patch (`pdfResolveAnnotationPatch`) to an
 * existing annotation: only present fields are touched. Every text change
 * (new contents, rich text, font, size, text colour or alignment) arrives as
 * the complete rich text to write, with the alignment stated beside it for
 * `/Q`. `color` rewrites the `/DA` colour (the border), keeping its font and
 * size.
 */
export function applyFreeTextPatch(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  patch: FreeTextPatch<PdfCoordinates>,
  ctx?: AnnotationWriteContext,
): void {
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
      cur ? standardFontFromCode(cur.fontCode) : DEFAULTS.fontFamily,
      cur && cur.fontSize > 0 ? cur.fontSize : DEFAULTS.fontSize,
      patch.color,
      ctx,
    );
  }
  if (patch.richText !== undefined) {
    // Everything regenerated: /RC, /DS, /DA, /Contents and the appearance.
    writeRichText(fn, annotPtr, patch.richText, ctx);
  }

  if (patch.textAlign !== undefined) {
    setTextAlignment(fn, annotPtr, textAlignmentToCode(patch.textAlign));
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
