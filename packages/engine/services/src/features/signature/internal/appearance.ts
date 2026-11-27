import {
  EngineError,
  EngineErrorCode,
  type FormWidget,
  type SignatureAppearanceBytes,
} from '@embedpdf/engine-core/runtime';
import { NULL_PTR, type PdfRuntimeModule, type Ptr } from '@embedpdf/engine-runtime';

import type { DrawingIndex } from '../../../document-session/DrawingIndex';
import { CloseStack } from '../../../document-session/lifecycle/PdfDocumentOpener';
import { readAppearanceFit, writeAppearanceFit } from '../../annotations/internal/appearanceFit';
import { exactBuffer, pictureFormatOf } from '../../annotations/internal/pictureFormat';
import { drawingFor } from '../../annotations/internal/write/stampDrawing';

/** `EPDF_STAMP_FIT_CONTAIN`: uniform scale, letterboxed and centred in the rect. */
const FIT_CONTAIN = 0;

/**
 * Draw a mark into a widget annotation's normal appearance: what a
 * signature shows, whether the field is being signed (`SignatureMutator`) or
 * only filled visually (`FormMutator`). The mark is a PNG, a JPEG or a
 * one-page PDF, and a PDF only when its caller passed it as `{ pdf }`.
 *
 * The mark is a drawing, as a stamp's picture is (`drawingFor`): the
 * document holds it once however many fields, stamps and push buttons show
 * it, and `drawings` finds the one it already holds. The widget places it
 * (`EPDFAnnot_SetDrawing`) in a wrapper of its own, fitted uniformly into
 * its box and turned as the widget turns (`/Rect`, `/MK /R`); neither is
 * written. `docPtr` is the document `drawings` indexes.
 *
 * `recordFit`, for a mark drawn in without signing, records the fit as a
 * stamp records its own: the widget then reads as having a mark in it
 * (`hasMark`), which its style never draws over. A signature's mark needs
 * no record (the field's value says it's signed), and a signing changes no
 * other key of its widget.
 */
export function bakeWidgetAppearance(
  runtime: PdfRuntimeModule,
  docPtr: Ptr,
  drawings: DrawingIndex,
  widget: FormWidget,
  mark: SignatureAppearanceBytes,
  { recordFit }: { recordFit: boolean },
): void {
  const { mem, fn } = runtime;
  const bytes = exactBuffer(mark.bytes);
  const format = pictureFormatOf(fn, mem, bytes, 'a signature appearance', mark.declaredPdf);
  withWidgetAnnotation(runtime, docPtr, widget, (annotPtr) => {
    const drawing = drawingFor(fn, mem, docPtr, drawings, bytes, format);
    if (!fn.EPDFAnnot_SetDrawing(annotPtr, drawing, FIT_CONTAIN)) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        'the appearance page could not be drawn into the widget',
      );
    }
    if (recordFit) writeAppearanceFit(fn, mem, annotPtr, 'contain');
  });
}

/**
 * Take a mark that was drawn in without signing out of a widget: its fit
 * record goes, so the widget reads as having no mark (`hasMark`), and the
 * widget draws its field's box again, in its style, in place of the mark.
 * A widget that records no mark is left as it is: what it shows isn't a
 * mark of ours to take out.
 */
export function clearWidgetMark(runtime: PdfRuntimeModule, docPtr: Ptr, widget: FormWidget): void {
  const { mem, fn } = runtime;
  withWidgetAnnotation(runtime, docPtr, widget, (annotPtr) => {
    if (readAppearanceFit(fn, mem, annotPtr) === null) return;
    writeAppearanceFit(fn, mem, annotPtr, null);
    if (!fn.EPDFAnnot_GenerateFormFieldAP(annotPtr)) {
      throw new EngineError(
        EngineErrorCode.Unknown,
        "the signature field's box could not be drawn into the widget",
      );
    }
  });
}

/** Run `body` with a signature widget's annotation loaded from its page. */
function withWidgetAnnotation(
  runtime: PdfRuntimeModule,
  docPtr: Ptr,
  widget: FormWidget,
  body: (annotPtr: Ptr) => void,
): void {
  const { fn } = runtime;
  const stack = new CloseStack();
  try {
    const pagePtr = widget.page
      ? fn.EPDFDoc_LoadPageByObjectNumber(docPtr, widget.page.objectNumber)
      : NULL_PTR;
    if (!pagePtr) {
      throw new EngineError(EngineErrorCode.NotFound, 'the widget page could not be loaded');
    }
    stack.push(() => fn.FPDF_ClosePage(pagePtr));
    const annotPtr = fn.EPDFPage_GetAnnotByObjectNumber(pagePtr, widget.objectNumber);
    if (!annotPtr) {
      throw new EngineError(EngineErrorCode.NotFound, 'the signature widget could not be loaded');
    }
    stack.push(() => fn.FPDFPage_CloseAnnot(annotPtr));
    body(annotPtr);
  } finally {
    stack.close();
  }
}
