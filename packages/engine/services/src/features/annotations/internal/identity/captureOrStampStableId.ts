import type { AnnotationStableId } from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';

import { generateUuid } from '../../../../shared/uuid';
import { readAnnotString } from '../read/annotationReadPrimitives';
import { writeAnnotationNm } from '../write/writeAnnotationBase';

/**
 * Read an annotation's stable id, opportunistically stamping a fresh
 * engine-generated UUID v4 as `/NM` if it is currently weak (no object
 * number, no `/NM`). Monotonic `/NM` rule: an already-durable annotation
 * is NEVER touched. Caller owns the lifecycle of `annotPtr`.
 *
 * Shared by the create/update/move mutator paths and the `/IRT`
 * relationship writer (which strengthens a weak parent before linking to
 * it, so the strengthened id can be reported in `meta.changed`).
 */
export function captureOrStampStableId(
  runtime: PdfRuntimeModule,
  annotPtr: Ptr,
): AnnotationStableId {
  const { fn, mem } = runtime;
  const objNum = fn.EPDFAnnot_GetObjectNumber(annotPtr);
  if (objNum > 0) return { kind: 'objectNumber', value: objNum };
  const nm = readAnnotString(fn, mem, annotPtr, 'NM');
  if (nm !== null && nm.length > 0) return { kind: 'nm', value: nm };
  const minted = generateUuid();
  writeAnnotationNm(fn, mem, annotPtr, minted);
  return { kind: 'nm', value: minted };
}
