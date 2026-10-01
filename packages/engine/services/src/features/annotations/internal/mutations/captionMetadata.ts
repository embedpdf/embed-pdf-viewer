import {
  EngineError,
  EngineErrorCode,
  touchesCaption,
  type Annotation,
  type AnnotationPatch,
  type PdfCoordinates,
} from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, Ptr } from '@embedpdf/engine-runtime';

/**
 * A polygon or polyline keeps its caption in `/EMBD_Metadata`. When that
 * entry is there but isn't a dictionary, a patch that touches the caption is
 * refused: there is nowhere to write it. The one check on a measurement patch
 * that has to read the file; the rest is `pdfResolveAnnotationPatch`.
 */
export function assertCaptionMetadataWritable(
  fn: PdfFunctions,
  annot: Ptr,
  current: Annotation<PdfCoordinates>,
  patch: AnnotationPatch<PdfCoordinates>,
): void {
  if (current.subtype !== 'polygon' && current.subtype !== 'polyline') return;
  if (
    touchesCaption(patch) &&
    fn.FPDFAnnot_HasKey(annot, 'EMBD_Metadata') &&
    fn.FPDFAnnot_GetValueType(annot, 'EMBD_Metadata') !== 6
  ) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      'Malformed annotation metadata cannot store a caption',
    );
  }
}
