import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';
import { NULL_PTR } from '@embedpdf/engine-runtime';

import { writeUtf16String } from '../../../../runtime/memory/strings';

/**
 * Write (or clear) one key in the document's Info dictionary.
 *
 *   value = null  -> remove the key (pass NULL_PTR; the fork's
 *                    `EPDF_SetMetaText` deletes the entry on a null value)
 *   value = "..."  -> set the key to the UTF-16 string (an empty string is
 *                    a real, present-but-empty value, matching the reader's
 *                    `emptyAs = ''` decode)
 *
 * Returns the native success flag. Mirrors v2 `setMetaText` (engine.ts),
 * minus v2's "empty string removes" quirk — three-state patch semantics
 * keep `null` (clear) and `''` (set empty) distinct.
 */
export function writeMetaText(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  docPtr: Ptr,
  key: string,
  value: string | null,
): boolean {
  if (value === null) {
    return fn.EPDF_SetMetaText(docPtr, key, NULL_PTR);
  }
  return writeUtf16String(mem, value, (ptr) => fn.EPDF_SetMetaText(docPtr, key, ptr));
}
