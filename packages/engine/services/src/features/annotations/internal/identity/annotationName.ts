import type { AnnotationRef, PageRef } from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { withScratchN } from '../../../../runtime/memory/scratch';
import { U64_BYTES, peekU64, pokeU64 } from '../../../../runtime/memory/u64';

/**
 * The name an annotation has for life (see `AnnotationRef`), for the one at
 * `index` of `page`'s `/Annots`:
 *
 *   - inline (no object number): its position. On a page nothing has
 *     restructured that is still its position in the uploaded file:
 *     creates append, updates edit in place, and every write that moves an
 *     entry promotes the page first.
 *   - an object the layer promoted from an inline annotation of the file:
 *     its birth name, the position it was born at;
 *   - any other object: its object number.
 */
export function annotationRefOf(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  docPtr: Ptr,
  page: PageRef,
  annotPtr: Ptr,
  index: number,
): AnnotationRef {
  const objectNumber = fn.EPDFAnnot_GetObjectNumber(annotPtr);
  if (objectNumber <= 0) return { kind: 'baseIndex', page, baseIndex: index };
  return objectRefOf(fn, mem, docPtr, page, objectNumber);
}

/**
 * The name of the annotation object `objectNumber` on `page`: its birth name
 * when the layer promoted it from an inline annotation, else its number.
 */
export function objectRefOf(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  docPtr: Ptr,
  page: PageRef,
  objectNumber: number,
): AnnotationRef {
  const baseIndex = birthIndexOf(fn, mem, docPtr, objectNumber);
  return baseIndex === null
    ? { kind: 'objectNumber', page, objectNumber }
    : { kind: 'baseIndex', page, baseIndex };
}

/** The position an object was born at in the file, when the layer promoted it from inline. */
function birthIndexOf(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  docPtr: Ptr,
  objectNumber: number,
): number | null {
  // Two `unsigned long` out-params: 4 bytes on wasm, 8 on a 64-bit native
  // build. A zeroed 8-byte slot reads the same either way.
  return withScratchN(mem, [U64_BYTES, U64_BYTES], ([pagePtr, birthPtr]) => {
    pokeU64(mem, pagePtr!, 0);
    pokeU64(mem, birthPtr!, 0);
    if (!fn.EPDFLayer_GetBirthName(docPtr, objectNumber, pagePtr!, birthPtr!)) return null;
    return peekU64(mem, birthPtr!);
  });
}
