import type {
  AnnotationSubtype,
  WidgetDraft,
  WidgetPatch,
  WidgetStyleDraftFields,
} from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { borderStyleToCode } from '../shapeBorderStyle';
import { standardFontToCode } from '../standardFont';
import { textAlignmentToCode } from '../textAlignment';
import { setAnnotRect } from './annotationWritePrimitives';

const MK_BORDER_COLOR = 0; // EPDF_MK_COLOR_BC
const MK_BACKGROUND_COLOR = 1; // EPDF_MK_COLOR_BG

export function isWidgetSubtype(subtype: AnnotationSubtype): subtype is 'widget' {
  return subtype === 'widget';
}

/**
 * THE widget-plane style writer: /MK colours, /BS, /DA, /Q. Both entry
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
    fn.EPDFAnnot_SetMKColor(annotPtr, MK_BORDER_COLOR, style.color.r, style.color.g, style.color.b);
  }
  if (style.interiorColor === null) {
    fn.EPDFAnnot_ClearMKColor(annotPtr, MK_BACKGROUND_COLOR);
  } else if (style.interiorColor) {
    fn.EPDFAnnot_SetMKColor(
      annotPtr,
      MK_BACKGROUND_COLOR,
      style.interiorColor.r,
      style.interiorColor.g,
      style.interiorColor.b,
    );
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
    const color = style.fontColor ?? { r: 0, g: 0, b: 0 };
    fn.EPDFAnnot_SetDefaultAppearance(
      annotPtr,
      standardFontToCode(style.fontFamily ?? 'helvetica'),
      style.fontSize ?? 12,
      color.r,
      color.g,
      color.b,
    );
  }

  if (style.textAlign !== undefined) {
    fn.EPDFAnnot_SetTextAlignment(annotPtr, textAlignmentToCode(style.textAlign));
  }
}

/** Create an INERT widget: placement + style. Adoption is a forms concern. */
export function applyWidgetDraft(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  draft: WidgetDraft,
): void {
  setAnnotRect(fn, mem, annotPtr, draft.rect);
  applyWidgetStyle(fn, mem, annotPtr, draft);
}

/**
 * Move/restyle a widget. When the widget is attached to a field the
 * family-correct appearance is re-baked afterwards; on inert widgets the
 * regenerator is a no-op (no /FT context) and that is fine.
 */
export function applyWidgetPatch(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  patch: WidgetPatch,
): void {
  if (patch.rect) {
    setAnnotRect(fn, mem, annotPtr, patch.rect);
  }
  applyWidgetStyle(fn, mem, annotPtr, patch);
  fn.EPDFAnnot_GenerateFormFieldAP(annotPtr);
}
