import type {
  AnnotationIdentityQuality,
  AnnotationRef,
  PageObjectNumber,
  RevisionToken,
} from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { readAnnotString } from './annotationReadPrimitives';

export interface AnnotationIdentity {
  ref: AnnotationRef;
  identityQuality: AnnotationIdentityQuality;
  nm: string | null;
}

/**
 * Decides which `AnnotationRef` form to expose on the wire and the
 * `identityQuality` flag.
 *
 * Order:
 *   1. `EPDFAnnot_GetObjectNumber(annot)` - if `> 0`, use `objectNumber`.
 *      Always durable.
 *   2. /NM - if present and non-empty, use `nm`. Always durable.
 *   3. Fallback: `index + revision`. Always weak. The revision must be
 *      provided by the caller (sourced from the live `RevisionAuthority`).
 */
export function readAnnotationIdentity(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  pageObjectNumber: PageObjectNumber,
  index: number,
  revision: RevisionToken,
): AnnotationIdentity {
  const objectNumber = fn.EPDFAnnot_GetObjectNumber(annotPtr);
  const nm = readAnnotString(fn, mem, annotPtr, 'NM');

  if (objectNumber > 0) {
    return {
      ref: {
        kind: 'objectNumber',
        pageObjectNumber,
        annotObjectNumber: objectNumber,
      },
      identityQuality: 'durable',
      nm: nm ?? null,
    };
  }

  if (nm && nm.length > 0) {
    return {
      ref: { kind: 'nm', pageObjectNumber, nm },
      identityQuality: 'durable',
      nm,
    };
  }

  return {
    ref: { kind: 'index', pageObjectNumber, index, revision },
    identityQuality: 'weak',
    nm: nm ?? null,
  };
}
