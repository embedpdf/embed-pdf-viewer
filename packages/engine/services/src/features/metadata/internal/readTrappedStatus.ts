import type { DocumentMetadataTrapped } from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, Ptr } from '@embedpdf/engine-runtime';

// PDFium /Trapped values:
//   0 = NotSet, 1 = True, 2 = False, 3 = Unknown.
// The v3 wire DTO has only true/false/unknown, so NotSet folds into 'unknown'.
const TRAPPED_TRUE = 1;
const TRAPPED_FALSE = 2;

export function readTrapped(fn: PdfFunctions, docPtr: Ptr): DocumentMetadataTrapped {
  const raw = Number(fn.EPDF_GetMetaTrapped(docPtr));
  if (raw === TRAPPED_TRUE) return 'true';
  if (raw === TRAPPED_FALSE) return 'false';
  return 'unknown';
}
