import type {
  Annotation,
  AnnotationPatch,
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
  WIDGET_STYLE_NAMES,
  faceForFontName,
  familyKey,
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
import { writeWidgetActions } from '../../../actions/internal/writeWidgetActions';
import { checkStyleCharacter } from '../../../forms/internal/widgetCaption';
import {
  readAnnotRect,
  readBorderStyle,
  readDefaultAppearance,
  readDefaultAppearanceFace,
} from '../read/annotationReadPrimitives';
import { boxFontName } from '../read/boxFontName';
import { readWidgetTurn } from '../read/readWidgetAnnotation';
import { widgetBorderStyleFromCode, widgetBorderStyleToCode } from '../shapeBorderStyle';
import type { AnnotationWriteContext } from './annotationWriteContext';
import { KEEP_FONT_CODE } from '../standardFont';
import { textAlignmentToCode } from '../textAlignment';
import {
  clearBorderDashPattern,
  setAnnotRect,
  setBorderDashPattern,
  setDefaultAppearance,
} from './annotationWritePrimitives';
import { applyAnnotationBaseDraft, applyAnnotationBasePatch } from './writeAnnotationBase';
import { applyDefaultAppearance } from './writeDefaultAppearance';

const MK_BORDER_COLOR = 0; // EPDF_MK_COLOR_BC
const MK_BACKGROUND_COLOR = 1; // EPDF_MK_COLOR_BG
const MK_CAPTION = 0; // EPDF_MK_TEXT_CA

export function isWidgetSubtype(subtype: string): subtype is 'widget' {
  return subtype === 'widget';
}

/**
 * A widget with a mark in it (`hasMark`: a signature, or one drawn in) shows
 * the mark, not its box: a change to its style, which only the box shows, is
 * refused before anything is written. A style sent back as it reads is no
 * change.
 */
export function assertMarkKeepsItsLook(
  current: Annotation<PdfCoordinates>,
  patch: AnnotationPatch<PdfCoordinates>,
): void {
  if (current.subtype !== 'widget' || !current.hasMark) return;
  const sent = patch as Partial<Record<(typeof WIDGET_STYLE_NAMES)[number], unknown>>;
  const changed = WIDGET_STYLE_NAMES.filter(
    (name) => sent[name] !== undefined && !semanticEqual(sent[name], current[name]),
  );
  if (changed.length > 0) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      `the widget has a mark in it, which its style doesn't draw: ${changed.join(', ')} can't change`,
    );
  }
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
  ctx?: AnnotationWriteContext,
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

  // Style and width share one call: the one a change leaves out keeps what the border has (a
  // widget without `/BS` has a solid 1-point border).
  if (style.strokeWidth !== undefined || style.borderStyle !== undefined) {
    const current = readBorderStyle(fn, mem, annotPtr);
    fn.EPDFAnnot_SetBorderStyle(
      annotPtr,
      widgetBorderStyleToCode(style.borderStyle ?? widgetBorderStyleFromCode(current.styleCode)),
      style.strokeWidth ?? current.width,
    );
  }

  if (style.dashArray === null) {
    clearBorderDashPattern(fn, annotPtr);
  } else if (style.dashArray !== undefined) {
    setBorderDashPattern(fn, mem, annotPtr, style.dashArray);
  }

  if (
    style.fontFamily !== undefined ||
    style.fontSize !== undefined ||
    style.fontColor !== undefined
  ) {
    applyWidgetFont(fn, mem, annotPtr, style, ctx);
  }

  if (style.textAlign !== undefined) {
    fn.EPDFAnnot_SetTextAlignment(annotPtr, textAlignmentToCode(style.textAlign));
  }

  // `/MK /CA`: only a push button's widget gets here with a caption, and only
  // a checkbox's or radio button's with a check style (`fitCaptionToFamily`).
  // A `null` symbol removes it: the family's own (a check, a circle) shows.
  const mkText =
    style.checkStyle !== undefined
      ? style.checkStyle && checkStyleCharacter(style.checkStyle)
      : style.caption;
  if (mkText === null) {
    fn.EPDFAnnot_SetMKText(annotPtr, MK_CAPTION, NULL_PTR);
  } else if (mkText !== undefined) {
    withUtf16String(mem, mkText, (text) => fn.EPDFAnnot_SetMKText(annotPtr, MK_CAPTION, text));
  }
}

/**
 * Write `/DA` with what `style` changes. What it leaves out keeps what `/DA`
 * says now, so a colour change keeps the font and its size. A font is a
 * standard font's name or a registered font's key; naming the face `/DA`
 * already has keeps that font, whatever the document has it as.
 *
 * The font a read gives is the widget's `/DA`, else the form's: `null` only
 * when neither has one. So `null` is that read sent back, which changes
 * nothing; a font can't be removed, and `null` beside one is refused.
 */
function applyWidgetFont(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  style: WidgetStyleDraftFields,
  ctx: AnnotationWriteContext | undefined,
): void {
  const current = readDefaultAppearance(fn, mem, annotPtr);
  const given = [style.fontFamily, style.fontSize, style.fontColor];
  if (given.includes(null) && current !== null) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      "a widget's font can't be removed: send a font, or leave the font fields out",
      { details: { field: 'fontFamily' } },
    );
  }
  // Without a font anywhere, a `null` is the read sent back: no change.
  const fontFamily = style.fontFamily ?? undefined;
  const fontSize = style.fontSize ?? undefined;
  const fontColor = style.fontColor ?? undefined;
  if (fontFamily === undefined && fontSize === undefined && fontColor === undefined) return;
  const size = fontSize ?? current?.fontSize ?? 12;
  const color = fontColor ?? current?.color ?? '#000000';
  const keeps =
    current !== null &&
    (fontFamily === undefined || namesCurrentFace(fn, mem, annotPtr, fontFamily, ctx));
  if (keeps) {
    setDefaultAppearance(fn, annotPtr, KEEP_FONT_CODE, size, color);
    return;
  }
  applyDefaultAppearance(fn, annotPtr, fontFamily ?? 'helvetica', size, color, ctx);
}

/** Whether `font` names the face `/DA` has now. */
function namesCurrentFace(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  font: string,
  ctx: AnnotationWriteContext | undefined,
): boolean {
  const current = readDefaultAppearanceFace(fn, mem, annotPtr);
  if (!current) return false;
  // The name a read gives the box's font (a document font's PostScript name).
  if (boxFontName(fn, mem, annotPtr, current) === font) return true;
  const named = faceForFontName(font, ctx?.describeFont);
  return (
    familyKey(named.family) === familyKey(current.family) &&
    (named.weight === undefined || named.weight === current.weight) &&
    (named.italic === undefined || named.italic === current.italic)
  );
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
  ctx?: AnnotationWriteContext,
): void {
  // The base writer never writes actions; a widget's are its own (below).
  const { actions: _actions, ...base } = draft;
  applyAnnotationBaseDraft(fn, mem, annotPtr, base);
  writeWidgetBox(fn, mem, annotPtr, { box: draft.box, rotation: draft.rotation ?? null }, null);
  applyWidgetStyle(fn, mem, annotPtr, draft, ctx);
}

/**
 * An update's `box` and `rotation`, each kept when left out (`rotation:
 * null` or `0` turns the widget upright about its middle). A `rect` never
 * gets here: the update resolved it into the box it places
 * (`pdfPrepareAnnotationPatch`).
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
  applyWidgetStyle(fn, mem, annotPtr, patch, ctx);
  if (patch.actions !== undefined) {
    if (!ctx?.runtime || !ctx.docPtr) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        "writing a widget's actions requires the runtime and the document on the write context",
      );
    }
    // A read's actions sent back unchanged never get here (`pdfPrepareAnnotationPatch`).
    writeWidgetActions(ctx.runtime, ctx.docPtr, annotPtr, patch.actions as never);
  }
}
