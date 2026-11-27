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
 * The drawing is all a mark writes: the widget reads as having one
 * (`hasMark`) because its appearance is our wrapper (`EPDFAnnot_GetDrawing`),
 * and nothing of ours goes into the widget's dictionary. A signature made
 * before seals that dictionary, and Acrobat reads a change to it as the
 * document altered; a new appearance it doesn't count as a change at all.
 */
export function bakeWidgetAppearance(
  runtime: PdfRuntimeModule,
  docPtr: Ptr,
  widget: FormWidget,
  mark: SignatureAppearanceBytes,
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
