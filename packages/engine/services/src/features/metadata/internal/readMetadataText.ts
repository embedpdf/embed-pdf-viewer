import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { readUtf16String } from '../../../runtime/memory/strings';

/**
 * Read a key from the document's Info dictionary. Returns null if the key
 * does not exist, '' if it exists but is empty, otherwise the UTF-16 string.
 *
 * `EPDF_HasMetaText` distinguishes an absent key (null) from a present
 * empty one (''); the value itself uses the standard UTF-16 getter ABI
 * (see `readUtf16String`, which keeps `''` as a real value here).
 */
export function readMetaText(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  docPtr: Ptr,
  key: string,
): string | null {
  if (!fn.EPDF_HasMetaText(docPtr, key)) return null;
  return readUtf16String(
    mem,
    (buf, capacity) => fn.FPDF_GetMetaText(docPtr, key, buf, capacity),
    '',
  );
}
