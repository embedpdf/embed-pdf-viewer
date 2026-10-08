import type {
  WidgetDraft,
  WidgetPatch,
  WidgetStyleDraftFields,
  PdfCoordinates,
} from '@embedpdf/engine-core/runtime';
import { EngineError, EngineErrorCode, rgbOf } from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { writeWidgetActions } from '../../../actions/internal/writeWidgetActions';
import { borderStyleToCode } from '../shapeBorderStyle';
import type { AnnotationWriteContext } from './annotationWriteContext';
import { standardFontToCode } from '../standardFont';
import { textAlignmentToCode } from '../textAlignment';
import { setAnnotRect } from './annotationWritePrimitives';
import { applyAnnotationBaseDraft, applyAnnotationBasePatch } from './writeAnnotationBase';

const MK_BORDER_COLOR = 0; // EPDF_MK_COLOR_BC
const MK_BACKGROUND_COLOR = 1; // EPDF_MK_COLOR_BG

export function isWidgetSubtype(subtype: string): subtype is 'widget' {
  return subtype === 'widget';
}

/**
 * The widget-plane style writer: /MK colours, /BS, /DA, /Q. Both entry
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
}

/** Create an inert widget: the fields every kind has, placement and style. Adoption is a forms concern. */
export function applyWidgetDraft(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  draft: WidgetDraft<PdfCoordinates>,
): void {
  // The base writer never writes actions; a widget's are its own (below).
  const { actions: _actions, ...base } = draft;
  applyAnnotationBaseDraft(fn, mem, annotPtr, base);
  setAnnotRect(fn, mem, annotPtr, draft.rect);
  applyWidgetStyle(fn, mem, annotPtr, draft);
}

/**
 * Move, restyle or retarget a widget. When the widget is attached to a field
 * the family-correct appearance is re-baked afterwards; on inert widgets the
 * regenerator is a no-op (no /FT context) and that is fine.
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
  if (patch.rect) {
    setAnnotRect(fn, mem, annotPtr, patch.rect);
  }
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
  fn.EPDFAnnot_GenerateFormFieldAP(annotPtr);
}
