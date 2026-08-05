import type { DocumentMetadataTrapped } from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, Ptr } from '@embedpdf/engine-runtime';

// PDFium /Trapped values mirror `readTrappedStatus`:
//   0 = NotSet, 1 = True, 2 = False, 3 = Unknown.
const TRAPPED_TRUE = 1;
const TRAPPED_FALSE = 2;
const TRAPPED_UNKNOWN = 3;

/**
 * Set the document's /Trapped Info entry from the wire enum. The v3 DTO
 * only carries `true | false | unknown`, so there is no "clear" form here
 * (unlike v2, which folded null into NotSet/removal); omit `trapped` from
 * the patch to leave it untouched.
 */
export function writeMetaTrapped(
  fn: PdfFunctions,
  docPtr: Ptr,
  status: DocumentMetadataTrapped,
): boolean {
  const code =
    status === 'true' ? TRAPPED_TRUE : status === 'false' ? TRAPPED_FALSE : TRAPPED_UNKNOWN;
  return fn.EPDF_SetMetaTrapped(docPtr, code);
}
