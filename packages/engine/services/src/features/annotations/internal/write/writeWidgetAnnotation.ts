import type {
  WidgetDraft,
  WidgetPatch,
  WidgetStyleDraftFields,
  PdfCoordinates,
  PdfRect,
  PdfRotation,
  PlacedDraft,
} from '@embedpdf/engine-core/runtime';
import {
  EngineError,
  EngineErrorCode,
  normalizePdfRect,
  pdfQuarterTurnBox,
  pdfRectTurnedBounds,
  rgbOf,
  semanticEqual,
} from '@embedpdf/engine-core/runtime';
import {
  NULL_PTR,
  type PdfFunctions,
  type PdfRuntimeMemory,
  type Ptr,
} from '@embedpdf/engine-runtime';

import { withUtf16String } from '../../../../runtime/memory/strings';
import { readAnnotRect } from '../read/annotationReadPrimitives';
import { readWidgetTurn } from '../read/readWidgetAnnotation';
import { writeWidgetActions } from '../../../actions/internal/writeWidgetActions';
import { borderStyleToCode } from '../shapeBorderStyle';
import type { AnnotationWriteContext } from './annotationWriteContext';
import { standardFontToCode } from '../standardFont';
import { textAlignmentToCode } from '../textAlignment';
import { setAnnotRect } from './annotationWritePrimitives';
import { applyAnnotationBaseDraft, applyAnnotationBasePatch } from './writeAnnotationBase';

const MK_BORDER_COLOR = 0; // EPDF_MK_COLOR_BC
const MK_BACKGROUND_COLOR = 1; // EPDF_MK_COLOR_BG
const MK_CAPTION = 0; // EPDF_MK_TEXT_CA

export function isWidgetSubtype(subtype: string): subtype is 'widget' {
  return subtype === 'widget';
}

/**
 * The widget-plane style writer: /MK colours and caption, /BS, /DA, /Q. Both entry
 * points funnel here — the widget annotation kind (create/patch) and
 * `doc.forms.createField`'s inline placements — so creation-time and
 * edit-time styling can never drift apart.
 */
export function applyWidgetStyle(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  style: WidgetStyleDraftFields,
): void {
  if (style.color === null) {
    fn.EPDFAnnot_ClearMKColor(annotPtr, MK_BORDER_COLOR);
  } else if (style.color) {
    const { r, g, b } = rgbOf(style.color);
    fn.EPDFAnnot_SetMKColor(annotPtr, MK_BORDER_COLOR, r, g, b);
  }
  if (style.interiorColor === null) {
    fn.EPDFAnnot_ClearMKColor(annotPtr, MK_BACKGROUND_COLOR);
  } else if (style.interiorColor) {
    const { r, g, b } = rgbOf(style.interiorColor);
    fn.EPDFAnnot_SetMKColor(annotPtr, MK_BACKGROUND_COLOR, r, g, b);
  }

  if (style.strokeWidth !== undefined || style.borderStyle !== undefined) {
    fn.EPDFAnnot_SetBorderStyle(
      annotPtr,
      borderStyleToCode(style.borderStyle ?? 'solid'),
      style.strokeWidth ?? 1,
    );
  }

  if (
    style.fontFamily !== undefined ||
    style.fontSize !== undefined ||
    style.fontColor !== undefined
  ) {
    const { r, g, b } = rgbOf(style.fontColor ?? '#000000');
    fn.EPDFAnnot_SetDefaultAppearance(
      annotPtr,
      standardFontToCode(style.fontFamily ?? 'helvetica'),
      style.fontSize ?? 12,
      r,
      g,
      b,
    );
  }

  if (style.textAlign !== undefined) {
    fn.EPDFAnnot_SetTextAlignment(annotPtr, textAlignmentToCode(style.textAlign));
  }

  // Only a push button's widget gets here with a caption (`fitCaptionToFamily`).
  if (style.caption === null) {
    fn.EPDFAnnot_SetMKText(annotPtr, MK_CAPTION, NULL_PTR);
  } else if (style.caption !== undefined) {
    withUtf16String(mem, style.caption, (text) =>
      fn.EPDFAnnot_SetMKText(annotPtr, MK_CAPTION, text),
    );
  }
}

/**
 * Write a widget's turn, `/MK /R`, counterclockwise as the file keeps it: a
 * clockwise quarter turn, `null` upright (which removes `/R`). The
 * appearance is drawn again by the caller.
 */
export function setWidgetTurn(fn: PdfFunctions, annotPtr: Ptr, rotation: PdfRotation | null): void {
  if (!fn.EPDFAnnot_SetMKRotation(annotPtr, (360 - (rotation ?? 0)) % 360)) {
    throw new EngineError(
      EngineErrorCode.Unknown,
      "the widget's turn (/MK /R) could not be written",
    );
  }
}

/**
 * A widget's box and turn: `/Rect` is where it stands, the box turned, and
 * `/MK /R` the turn. Each is written only when it changes.
 */
function writeWidgetBox(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  geometry: { box: PdfRect; rotation: PdfRotation | null },
  current: { rect: PdfRect; rotation: PdfRotation | null } | null,
): void {
  const box = normalizePdfRect(geometry.box);
  const rect = geometry.rotation ? pdfRectTurnedBounds(box, geometry.rotation) : box;
  if (!current || geometry.rotation !== current.rotation) {
    setWidgetTurn(fn, annotPtr, geometry.rotation);
  }
  if (!current || !semanticEqual(rect, current.rect)) setAnnotRect(fn, mem, annotPtr, rect);
}

/** Create an inert widget: the fields every kind has, placement and style. Adoption is a forms concern. */
export function applyWidgetDraft(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  draft: PlacedDraft<WidgetDraft<PdfCoordinates>>,
): void {
  // The base writer never writes actions; a widget's are its own (below).
  const { actions: _actions, ...base } = draft;
  applyAnnotationBaseDraft(fn, mem, annotPtr, base);
  writeWidgetBox(fn, mem, annotPtr, { box: draft.box, rotation: draft.rotation ?? null }, null);
  applyWidgetStyle(fn, mem, annotPtr, draft);
}

/**
 * An update's `box` and `rotation`, each kept when left out (`rotation:
 * null` or `0` turns the widget upright about its middle). A `rect` never
 * gets here: the update resolved it into the box it places
 * (`checkAnnotationPatch`).
 */
function applyWidgetBoxPatch(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  patch: { box?: PdfRect; rotation?: PdfRotation | null },
): void {
  if (patch.box === undefined && patch.rotation === undefined) return;
  const rect = normalizePdfRect(readAnnotRect(fn, mem, annotPtr));
  const turn = readWidgetTurn(fn, annotPtr);
  writeWidgetBox(
    fn,
    mem,
    annotPtr,
    {
      box: patch.box ?? pdfQuarterTurnBox(rect, turn ?? 0),
      rotation: patch.rotation === undefined ? turn : patch.rotation || null,
    },
    { rect, rotation: turn },
  );
}

/**
 * Move, restyle or retarget a widget. Whether its appearance is drawn again
 * is the update's decision (`AnnotationMutator`), as for every kind.
 */
export function applyWidgetPatch(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  patch: WidgetPatch<PdfCoordinates>,
  ctx?: AnnotationWriteContext,
): void {
  const { actions: _actions, ...base } = patch;
  applyAnnotationBasePatch(fn, mem, annotPtr, base);
  applyWidgetBoxPatch(fn, mem, annotPtr, patch);
  applyWidgetStyle(fn, mem, annotPtr, patch);
  if (patch.actions !== undefined) {
    if (!ctx?.runtime || !ctx.docPtr) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        "writing a widget's actions requires the runtime and the document on the write context",
      );
    }
    // A read's actions sent back unchanged never get here (`checkAnnotationPatch`).
    writeWidgetActions(ctx.runtime, ctx.docPtr, annotPtr, patch.actions as never);
  }
}
