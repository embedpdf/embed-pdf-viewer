import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';

import { CloseStack } from '../../../document-session/lifecycle/PdfDocumentOpener';

/**
 * Draw one page of a PDF into a widget annotation's normal appearance —
 * what a signature's mark is, whether the field is being signed
 * (`SignatureMutator`) or only filled visually (`FormMutator`). The
 * artwork page is scaled into the widget's rect by the fork.
 */
export function bakeWidgetAppearance(
  runtime: PdfRuntimeModule,
  docPtr: Ptr,
  widget: { annotObjectNumber: number; pageObjectNumber: number },
  pdf: Uint8Array,
  pageIndex: number,
): void {
  const { mem, fn } = runtime;
  const stack = new CloseStack();
  try {
    const pagePtr = fn.EPDFDoc_LoadPageByObjectNumber(docPtr, widget.pageObjectNumber);
    if (!pagePtr) {
      throw new EngineError(EngineErrorCode.NotFound, 'the widget page could not be loaded');
    }
    stack.push(() => fn.FPDF_ClosePage(pagePtr));
    const annotPtr = fn.EPDFPage_GetAnnotByObjectNumber(pagePtr, widget.annotObjectNumber);
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
    if (!fn.EPDFAnnot_SetAppearanceFromPage(annotPtr, artworkPtr, pageIndex)) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        'the appearance page could not be drawn into the widget',
      );
    }
  } finally {
    stack.close();
  }
}
