import type { AnnotationDTO, PageObjectNumber, RevisionToken } from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import type { AnnotationReadContext } from './annotationReadContext';
import { pickReader } from './annotationReaderRegistry';
import { readAnnotationBase } from './readAnnotationBase';

/**
 * Materialise a single annotation DTO from a live `annotPtr`, reusing the
 * exact same code paths the list readers use. Caller owns the lifecycle of
 * `annotPtr` (this function does NOT close it) so the mutator can keep it
 * for follow-up writes.
 *
 * Used by:
 *   - `AnnotationMutator.create()` after `EPDFPage_CreateAnnot` to
 *     produce `AnnotationCreateResult.created`.
 *   - `AnnotationMutator.update()` after writes complete to produce
 *     `AnnotationUpdateResult.updated`.
 */
export function readAnnotationFromPtr(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  pageObjectNumber: PageObjectNumber,
  index: number,
  revision: RevisionToken,
  ctx: AnnotationReadContext,
): AnnotationDTO {
  const base = readAnnotationBase(fn, mem, ctx.docPtr, annotPtr, pageObjectNumber, index, revision);
  const subtypeCode = fn.FPDFAnnot_GetSubtype(annotPtr);
  const { reader } = pickReader(subtypeCode);
  return reader(fn, mem, annotPtr, base, subtypeCode, ctx);
}
