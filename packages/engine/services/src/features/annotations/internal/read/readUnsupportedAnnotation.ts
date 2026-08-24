import type { AnnotationBase, UnsupportedAnnotationDTO } from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { readAnnotString } from './annotationReadPrimitives';

/**
 * Forward-compat fallback. Captures the raw subtype code (and best-effort
 * subtype name from the dict) so debugging information survives across
 * the wire even when no per-subtype reader has been wired yet.
 */
export function readUnsupported(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  base: AnnotationBase,
  rawSubtypeCode: number,
): UnsupportedAnnotationDTO {
  const rawSubtypeName = readAnnotString(fn, mem, annotPtr, 'Subtype');
  return {
    ...base,
    subtype: 'unsupported',
    rawSubtypeCode,
    rawSubtypeName,
  };
}
