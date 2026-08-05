import type {
  AnnotationRef,
  AnnotationReplyType,
  PageObjectNumber,
} from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { readAnnotString } from './annotationReadPrimitives';
import { replyTypeFromCode } from '../replyType';

export interface AnnotationRelationship {
  inReplyTo: AnnotationRef | null;
  replyType: AnnotationReplyType | null;
}

const NO_RELATIONSHIP: AnnotationRelationship = { inReplyTo: null, replyType: null };

/**
 * Read the `/IRT` + `/RT` relationship edge of an annotation.
 *
 * `/IRT` is an indirect reference to the parent annotation, which (per ISO
 * 32000 §12.5.6.2) lives on the SAME page — so we surface the parent with
 * the same `pageObjectNumber` and the same identity precedence the rest of
 * the engine uses (objectNumber, then `/NM`). We do NOT fall back to an
 * index ref: an `/IRT` target is by construction an indirect object, so its
 * object number is always available. In the pathological case where neither
 * an object number nor an `/NM` can be read (a malformed direct-object
 * target), we report no relationship rather than an unaddressable parent —
 * keeping the invariant `replyType === null` iff `inReplyTo === null`.
 *
 * `/RT` is read via `EPDFAnnot_GetReplyType`, which returns the `/R` default
 * when `/RT` is absent; we only consult it when `/IRT` is present, so a
 * top-level annotation never spuriously reports `'reply'`.
 */
export function readAnnotationRelationship(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  pageObjectNumber: PageObjectNumber,
): AnnotationRelationship {
  const parentPtr = fn.FPDFAnnot_GetLinkedAnnot(annotPtr, 'IRT');
  if (!parentPtr) return NO_RELATIONSHIP;

  try {
    const inReplyTo = readParentRef(fn, mem, parentPtr, pageObjectNumber);
    if (!inReplyTo) return NO_RELATIONSHIP;
    return { inReplyTo, replyType: replyTypeFromCode(fn.EPDFAnnot_GetReplyType(annotPtr)) };
  } finally {
    fn.FPDFPage_CloseAnnot(parentPtr);
  }
}

function readParentRef(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  parentPtr: Ptr,
  pageObjectNumber: PageObjectNumber,
): AnnotationRef | null {
  const objectNumber = fn.EPDFAnnot_GetObjectNumber(parentPtr);
  if (objectNumber > 0) {
    return { kind: 'objectNumber', pageObjectNumber, annotObjectNumber: objectNumber };
  }
  const nm = readAnnotString(fn, mem, parentPtr, 'NM');
  if (nm && nm.length > 0) {
    return { kind: 'nm', pageObjectNumber, nm };
  }
  return null;
}
