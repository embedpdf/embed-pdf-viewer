import {
  EngineError,
  EngineErrorCode,
  sniffBinaryMetadata,
  type BinaryMetadata,
  type FormWidget,
  type SignatureAppearanceBytes,
} from '@embedpdf/engine-core/runtime';
import { NULL_PTR, type PdfRuntimeModule, type Ptr } from '@embedpdf/engine-runtime';

import { CloseStack } from '../../../document-session/lifecycle/PdfDocumentOpener';
import { withAppearanceDocument } from '../../annotations/internal/appearanceDocument';
import { readAppearanceFit, writeAppearanceFit } from '../../annotations/internal/appearanceFit';

/** `EPDF_STAMP_FIT_CONTAIN`: uniform scale, letterboxed and centred in the rect. */
const FIT_CONTAIN = 0;

/**
 * Draw a mark into a widget annotation's normal appearance: what a
 * signature shows, whether the field is being signed (`SignatureMutator`) or
 * only filled visually (`FormMutator`). The mark is a PNG, a JPEG or a
 * one-page PDF, and a PDF only when its caller passed it as `{ pdf }`. An
 * image becomes a page of its own size first, as a stamp's does
 * (`withAppearanceDocument`), so every mark is drawn the same way.
 *
 * Two fork calls, the same pair the stamp path makes: `SetAppearanceFromPage`
 * clones the page into the document as a wrapped Form XObject (page content
 * and resources in a child form, the outer stream a placement matrix), then
 * `UpdateAppearanceToRect` writes that placement — the page fitted uniformly
 * into the widget's rect. Without the second call the page sits in its own
 * box and the viewer's BBox→/Rect mapping stretches it to the rect's aspect.
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
  widget: FormWidget,
  mark: SignatureAppearanceBytes,
  { recordFit }: { recordFit: boolean },
): void {
  const { mem, fn } = runtime;
  const { bytes } = mark;
  const format = markFormat(mark);
  withWidgetAnnotation(runtime, docPtr, widget, (annotPtr) => {
    const dataPtr = mem.alloc(bytes.byteLength);
    try {
      mem.writeBytes(dataPtr, bytes);
      withAppearanceDocument(fn, mem, dataPtr, bytes.byteLength, format, (markPtr) => {
        const pages = fn.FPDF_GetPageCount(markPtr);
        if (pages !== 1) {
          throw new EngineError(
            EngineErrorCode.InvalidArg,
            `the appearance PDF has ${pages} pages; a signature appearance takes a one-page PDF`,
          );
        }
        if (!fn.EPDFAnnot_SetAppearanceFromPage(annotPtr, markPtr, 0)) {
          throw new EngineError(
            EngineErrorCode.InvalidArg,
            'the appearance page could not be drawn into the widget',
          );
        }
      });
    } finally {
      mem.free(dataPtr);
    }
    if (!fn.EPDFAnnot_UpdateAppearanceToRect(annotPtr, FIT_CONTAIN)) {
      throw new EngineError(
        EngineErrorCode.Unknown,
        'the appearance page could not be fitted into the widget',
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

/**
 * What a mark's bytes are. Bytes passed as `{ pdf }` are a PDF, which opens
 * as one or is refused as one that doesn't. Bytes passed as themselves are
 * what their first bytes say, and none of the three is refused.
 */
function markFormat({ bytes, declaredPdf }: SignatureAppearanceBytes): BinaryMetadata {
  if (declaredPdf) return { mimeType: 'application/pdf' };
  const exact =
    bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
      ? (bytes.buffer as ArrayBuffer)
      : (bytes.slice().buffer as ArrayBuffer);
  const format = sniffBinaryMetadata(exact);
  if (!format) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      'the appearance resource must be PNG, JPEG or one-page PDF bytes',
    );
  }
  return format;
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
