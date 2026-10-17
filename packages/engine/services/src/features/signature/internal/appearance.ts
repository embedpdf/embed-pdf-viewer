import type { FormWidget } from '@embedpdf/engine-core/runtime';
import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import { NULL_PTR, type PdfRuntimeModule, type Ptr } from '@embedpdf/engine-runtime';

import { CloseStack } from '../../../document-session/lifecycle/PdfDocumentOpener';

/** `EPDF_STAMP_FIT_CONTAIN`: uniform scale, letterboxed and centred in the rect. */
const FIT_CONTAIN = 0;

/**
 * Draw a one-page PDF into a widget annotation's normal appearance —
 * what a signature's mark is, whether the field is being signed
 * (`SignatureMutator`) or only filled visually (`FormMutator`).
 *
 * Two fork calls, the same pair the stamp path makes: `SetAppearanceFromPage`
 * clones the page into the document as a wrapped Form XObject (page content
 * and resources in a child form, the outer stream a placement matrix), then
 * `UpdateAppearanceToRect` writes that placement — the page fitted uniformly
 * into the widget's rect. Without the second call the page sits in its own
 * box and the viewer's BBox→/Rect mapping stretches it to the rect's aspect.
 */
export function bakeWidgetAppearance(
  runtime: PdfRuntimeModule,
  docPtr: Ptr,
  widget: FormWidget,
  pdf: Uint8Array,
): void {
  const { mem, fn } = runtime;
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
    const dataPtr = mem.alloc(pdf.byteLength);
    stack.push(() => mem.free(dataPtr));
    mem.writeBytes(dataPtr, pdf);
    const artworkPtr = fn.FPDF_LoadMemDocument64(dataPtr, pdf.byteLength, '');
    if (!artworkPtr) {
      throw new EngineError(EngineErrorCode.MalformedPdf, 'the appearance PDF could not be opened');
    }
    stack.push(() => fn.FPDF_CloseDocument(artworkPtr));
    const pages = fn.FPDF_GetPageCount(artworkPtr);
    if (pages !== 1) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `the appearance PDF has ${pages} pages; a signature appearance takes a one-page PDF`,
      );
    }
    if (!fn.EPDFAnnot_SetAppearanceFromPage(annotPtr, artworkPtr, 0)) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        'the appearance page could not be drawn into the widget',
      );
    }
    if (!fn.EPDFAnnot_UpdateAppearanceToRect(annotPtr, FIT_CONTAIN)) {
      throw new EngineError(
        EngineErrorCode.Unknown,
        'the appearance page could not be fitted into the widget',
      );
    }
  } finally {
    stack.close();
  }
}
