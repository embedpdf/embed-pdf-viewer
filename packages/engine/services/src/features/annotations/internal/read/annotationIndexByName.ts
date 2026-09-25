import type { PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';

/**
 * Where the annotation named `nm` is in a page's `/Annots`, or -1. Read from
 * the page's dictionaries, so no page is loaded. A name is unique on its
 * page (ISO 32000-2 §12.5.2): `create` and `import` both check it here.
 */
export function annotationIndexByName(
  runtime: PdfRuntimeModule,
  docPtr: Ptr,
  pageIndex: number,
  nm: string,
): number {
  const { fn, mem } = runtime;
  const namePtr = mem.writeU16String(nm);
  try {
    return fn.EPDFPage_GetAnnotIndexByNameRaw(docPtr, pageIndex, namePtr);
  } finally {
    mem.free(namePtr);
  }
}
