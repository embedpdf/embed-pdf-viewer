import {
  EngineError,
  EngineErrorCode,
  type FormWidget,
  type SignatureAppearanceBytes,
} from '@embedpdf/engine-core/runtime';
import { NULL_PTR, type PdfRuntimeModule, type Ptr } from '@embedpdf/engine-runtime';

import type { DrawingIndex } from '../../../document-session/DrawingIndex';
import { CloseStack } from '../../../document-session/lifecycle/PdfDocumentOpener';
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
 * The drawing is all a mark writes: the widget reads as having one
 * (`hasMark`) because its appearance is our wrapper (`EPDFAnnot_GetDrawing`),
 * and nothing of ours goes into the widget's dictionary. A signature made
 * before seals that dictionary, and Acrobat reads a change to it as the
 * document altered; a new appearance it doesn't count as a change at all.
 */
export function bakeWidgetAppearance(
  runtime: PdfRuntimeModule,
  docPtr: Ptr,
  drawings: DrawingIndex,
  widget: FormWidget,
  mark: SignatureAppearanceBytes,
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
  });
}

/**
 * Take a mark that was drawn in without signing out of a widget: the widget
 * draws its field's box again, in its style, in place of the mark, and then
 * reads as having no mark (`hasMark`). A widget whose appearance isn't our
 * wrapper is left as it is: what it shows isn't a mark of ours to take out.
 * The `/EMBD_Metadata/AppearanceFit` an older version wrote beside a mark is
 * left too: nothing reads it, and taking it out would change the widget's
 * dictionary.
 */
export function clearWidgetMark(runtime: PdfRuntimeModule, docPtr: Ptr, widget: FormWidget): void {
  const { fn } = runtime;
  withWidgetAnnotation(runtime, docPtr, widget, (annotPtr) => {
    if (fn.EPDFAnnot_GetDrawing(annotPtr) === 0) return;
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
