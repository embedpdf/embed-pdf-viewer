import {
  NULL_PTR,
  type PdfFunctions,
  type PdfRuntimeMemory,
  type Ptr,
} from '@embedpdf/engine-runtime';

import { pdfFromClockwise } from './readAnnotationTransformMetadata';
import { readAnnotationTurn } from './readAnnotationTurn';
import { withScratch } from '../../../../runtime/memory/scratch';
import { RECTF_BYTES, writeRectF } from '../../../../runtime/memory/structs';

/**
 * An annotation's normal appearance as a one-page drawing document (the
 * fork's `EPDFAnnot_ExportAppearance`), without the turn the annotation reads
 * (`readAnnotationTurn`): a copy made from its data turns it again. `NULL`
 * when there is no normal appearance; the caller closes the document.
 */
export function exportUnturnedAppearance(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
): Ptr {
  const turn = readAnnotationTurn(fn, mem, annotPtr);
  if (!turn) return fn.EPDFAnnot_ExportAppearance(annotPtr, 0, NULL_PTR);
  return withScratch(mem, RECTF_BYTES, (boxPtr) => {
    writeRectF(mem, boxPtr, turn.box);
    return fn.EPDFAnnot_ExportAppearance(annotPtr, pdfFromClockwise(turn.rotation), boxPtr);
  });
}
